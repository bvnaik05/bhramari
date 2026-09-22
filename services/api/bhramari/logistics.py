from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .access import owned_lot, safety_status
from .auth import current_user, require_roles
from .db import get_db
from .disputes import create_review
from .events import emit
from .models import Custody, Lot, Organisation, Record, User
from .schemas import CustodyDecision, CustodyInput, ShipmentInput
from .traceability import row_view

router = APIRouter(tags=["Custody and logistics"])
operators = require_roles("beekeeper", "fpo", "processor", "buyer", "admin")


@router.get("/custody")
def custody_list(user: User = Depends(current_user), db: Session = Depends(get_db)):
    query = select(Custody)
    if user.role != "admin":
        query = query.where(or_(Custody.from_org_id == user.org_id, Custody.to_org_id == user.org_id))
    return [row_view(row) for row in db.scalars(query)]


@router.post("/custody", status_code=201)
def propose(body: CustodyInput, user: User = Depends(operators), db: Session = Depends(get_db)):
    lot = owned_lot(db, user, body.lot_id)
    if body.to_org_id == lot.owner_org_id or not db.get(Organisation, body.to_org_id):
        raise HTTPException(422, "Choose another registered receiving organisation")
    pending = db.scalar(select(Custody).where(Custody.lot_id == lot.id, Custody.status == "proposed"))
    if pending:
        raise HTTPException(409, "A custody proposal is already pending")
    record = Custody(lot_id=lot.id, from_org_id=lot.owner_org_id, to_org_id=body.to_org_id, proposed_by=user.id, note=body.note)
    db.add(record)
    db.flush()
    emit(db, user, "custody.proposed", lot.id, row_view(record) | {"created_at": record.created_at.isoformat()})
    return row_view(record)


@router.post("/custody/{custody_id}/decision")
def decide(custody_id: str, body: CustodyDecision, user: User = Depends(operators), db: Session = Depends(get_db)):
    record = db.scalar(select(Custody).where(Custody.id == custody_id).with_for_update())
    if not record:
        raise HTTPException(404, "Custody proposal not found")
    if record.to_org_id != user.org_id or record.proposed_by == user.id:
        raise HTTPException(403, "Only the independent receiving party can decide")
    if record.status != "proposed":
        raise HTTPException(409, "This proposal has already been decided")
    lot = db.scalar(select(Lot).where(Lot.id == record.lot_id).with_for_update())
    if record.from_org_id != lot.owner_org_id or safety_status(db, lot) != "active":
        raise HTTPException(409, "Ownership or safety state changed; resolve the proposal")
    record.status, record.accepted_by = body.decision, user.id
    if body.decision == "accepted":
        lot.owner_org_id = user.org_id
    else:
        create_review(db, "custody_dispute", record.from_org_id, "custody", record.id,
                      body.note or "The receiving organization disputed the custody handover.",
                      {"lot_id": lot.id, "from_org_id": record.from_org_id, "to_org_id": record.to_org_id,
                       "reported_by": user.id}, due_hours=48)
    emit(db, user, f"custody.{body.decision}", lot.id, {"custody_id": record.id, "note": body.note})
    return row_view(record)


@router.get("/shipments")
def shipments(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Record).where(Record.kind == "shipment"))
    return [row_view(row) for row in rows if user.role == "admin" or user.org_id in {row.org_id, row.data.get("to_org_id")}]


@router.post("/shipments", status_code=201)
def ship(body: ShipmentInput, user: User = Depends(operators), db: Session = Depends(get_db)):
    lot = owned_lot(db, user, body.lot_id)
    custody = db.get(Custody, body.custody_id)
    if not custody or custody.lot_id != lot.id or custody.from_org_id != user.org_id or custody.status != "proposed":
        raise HTTPException(409, "Shipment needs your matching pending custody proposal")
    if any(row.data.get("custody_id") == custody.id for row in db.scalars(select(Record).where(Record.kind == "shipment"))):
        raise HTTPException(409, "A shipment already exists for this handover")
    shipment = Record(kind="shipment", org_id=user.org_id, data={**body.model_dump(), "to_org_id": custody.to_org_id, "status": "in_transit"})
    db.add(shipment)
    db.flush()
    emit(db, user, "shipment.dispatched", lot.id, shipment.data)
    return row_view(shipment)


@router.post("/shipments/{shipment_id}/receive")
def receive(shipment_id: str, user: User = Depends(operators), db: Session = Depends(get_db)):
    shipment = db.scalar(select(Record).where(Record.id == shipment_id, Record.kind == "shipment").with_for_update())
    if not shipment:
        raise HTTPException(404, "Shipment not found")
    if shipment.data["to_org_id"] != user.org_id:
        raise HTTPException(403, "Only this shipment's recipient may receive it")
    custody = db.get(Custody, shipment.data["custody_id"])
    if custody.status != "accepted" or shipment.data["status"] != "in_transit":
        raise HTTPException(409, "Accept custody first; a shipment can be received only once")
    shipment.data = {**shipment.data, "status": "received"}
    emit(db, user, "shipment.received", shipment.data["lot_id"], {"shipment_id": shipment.id})
    return row_view(shipment)
