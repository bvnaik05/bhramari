from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .access import ancestor_ids, assert_org, owned_lot, safety_status
from .auth import current_user, require_roles
from .db import get_db
from .events import emit
from .models import Custody, Evidence, Hive, Lot, LotEdge, Record, User, uid
from .schemas import HarvestInput, HiveInput, InspectionInput, OperationInput

router = APIRouter(tags=["Hives and traceability"])
operators = require_roles("beekeeper", "fpo", "processor", "admin")


def row_view(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}


@router.get("/hives")
def hives(user: User = Depends(current_user), db: Session = Depends(get_db)):
    query = select(Hive).order_by(Hive.created_at)
    if user.role != "admin":
        query = query.where(Hive.org_id == user.org_id)
    return [row_view(hive) for hive in db.scalars(query)]


@router.post("/hives", status_code=201)
def create_hive(body: HiveInput, user: User = Depends(operators), db: Session = Depends(get_db)):
    hive = Hive(**body.model_dump(), org_id=user.org_id)
    db.add(hive)
    db.flush()
    emit(db, user, "hive.registered", hive.id, body.model_dump())
    return row_view(hive)


@router.get("/hives/{hive_id}/inspections")
def inspections(hive_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    hive = db.get(Hive, hive_id)
    if not hive:
        raise HTTPException(404, "Hive not found")
    assert_org(user, hive.org_id)
    return [row_view(record) for record in db.scalars(select(Record).where(Record.kind == "inspection", Record.org_id == hive.org_id)) if record.data.get("hive_id") == hive_id]


@router.post("/hives/{hive_id}/inspections", status_code=201)
def create_inspection(hive_id: str, body: InspectionInput, user: User = Depends(operators), db: Session = Depends(get_db)):
    return inspect_hive(db, user, hive_id, body)


def inspect_hive(db, user, hive_id, body):
    hive = db.get(Hive, hive_id)
    if not hive:
        raise HTTPException(404, "Hive not found")
    assert_org(user, hive.org_id)
    hive.status = body.status
    record = Record(kind="inspection", org_id=user.org_id, data={"hive_id": hive_id, **body.model_dump()})
    db.add(record)
    db.flush()
    emit(db, user, "hive.inspected", hive_id, record.data)
    return row_view(record)


@router.get("/lots")
def lots(user: User = Depends(current_user), db: Session = Depends(get_db)):
    query = select(Lot).order_by(Lot.created_at.desc())
    if user.role not in {"admin", "lab"}:
        query = query.where(Lot.owner_org_id == user.org_id)
    return [row_view(lot) for lot in db.scalars(query)]


@router.post("/lots/harvest", status_code=201)
def create_harvest(body: HarvestInput, user: User = Depends(operators), db: Session = Depends(get_db)):
    return row_view(harvest(db, user, body))


def harvest(db, user, body):
    if user.role not in {"beekeeper", "fpo", "admin"}:
        raise HTTPException(403, "Only registered field organisations may record harvests")
    hive = db.get(Hive, body.hive_id)
    if not hive:
        raise HTTPException(404, "Hive not found")
    assert_org(user, hive.org_id)
    identifier = uid()
    lot = Lot(id=identifier, code=f"BHR-{identifier[:8].upper()}", product=body.product, quantity_g=body.quantity_g, available_g=body.quantity_g, owner_org_id=user.org_id, source_hive_id=hive.id, region=hive.region, floral=body.floral, method="harvest")
    db.add(lot)
    db.flush()
    emit(db, user, "lot.harvested", lot.id, body.model_dump())
    return lot


def consume(db, lot, grams):
    result = db.execute(update(Lot).where(Lot.id == lot.id, Lot.available_g >= grams, Lot.status == "active").values(available_g=Lot.available_g - grams))
    if result.rowcount != 1:
        raise HTTPException(409, "Available quantity is insufficient; no quantity was consumed")
    db.flush()


@router.post("/lots/operations", status_code=201)
def operation(body: OperationInput, user: User = Depends(operators), db: Session = Depends(get_db)):
    input_ids = [item.lot_id for item in body.inputs]
    if len(input_ids) != len(set(input_ids)):
        raise HTTPException(422, "Each input lot may appear only once")
    if body.operation == "split" and (len(body.inputs) != 1 or len(body.outputs) < 2):
        raise HTTPException(422, "Split requires one parent and at least two children")
    if body.operation == "aggregate" and (len(body.inputs) < 2 or len(body.outputs) != 1):
        raise HTTPException(422, "Aggregation requires multiple parents and one output")
    total_in = sum(item.quantity_g for item in body.inputs)
    if total_in != sum(item.quantity_g for item in body.outputs) + body.loss_g:
        raise HTTPException(409, "Mass balance failed: inputs must equal outputs plus explicit process loss")
    parents = {key: owned_lot(db, user, key) for key in sorted(input_ids)}
    products = {lot.product for lot in parents.values()}
    if len(products) != 1 or any(output.product not in products for output in body.outputs):
        raise HTTPException(422, "Honey and beeswax require separate material balances")
    if body.operation != "transform" and body.loss_g:
        raise HTTPException(422, "Only transformations may record process loss")
    for item in body.inputs:
        consume(db, parents[item.lot_id], item.quantity_g)
    operation_id, children = uid(), []
    first = next(iter(parents.values()))
    for output in body.outputs:
        identifier = uid()
        child = Lot(id=identifier, code=f"BHR-{identifier[:8].upper()}", product=output.product, quantity_g=output.quantity_g, available_g=output.quantity_g, owner_org_id=user.org_id, region=first.region if len({p.region for p in parents.values()}) == 1 else "Multi-region India", floral=first.floral if len({p.floral for p in parents.values()}) == 1 else "Multiflora", method=body.method)
        db.add(child)
        db.flush()
        remaining = output.quantity_g
        for index, item in enumerate(body.inputs):
            contribution = remaining if index == len(body.inputs) - 1 else output.quantity_g * item.quantity_g // total_in
            remaining -= contribution
            db.add(LotEdge(parent_id=item.lot_id, child_id=child.id, quantity_g=contribution, operation_id=operation_id))
        children.append(row_view(child))
    emit(db, user, f"lot.{body.operation}", operation_id, {**body.model_dump(), "output_ids": [child["id"] for child in children]})
    return {"operation_id": operation_id, "lots": children}


@router.get("/lots/{lot_id}/lineage")
def lineage(lot_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    lot = db.get(Lot, lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")
    if user.role not in {"lab", "admin"}:
        assert_org(user, lot.owner_org_id)
    ids = ancestor_ids(db, lot_id)
    evidence = db.scalars(select(Evidence).where(Evidence.lot_id.in_(ids))).all()
    return {"lot": {**row_view(lot), "status": safety_status(db, lot)}, "ancestors": [row_view(row) for row in db.scalars(select(Lot).where(Lot.id.in_(ids - {lot_id})))], "edges": [row_view(row) for row in db.scalars(select(LotEdge).where(LotEdge.child_id.in_(ids)))], "evidence": [{key: value for key, value in row_view(row).items() if key != "object_path"} for row in evidence], "custody": [row_view(row) for row in db.scalars(select(Custody).where(Custody.lot_id.in_(ids)))]}
