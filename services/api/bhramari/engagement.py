"""Evidence-first B2B supply matching, quotations and inventory reservations."""

from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import current_user, require_roles
from .access import safety_status
from .community import add_record, owned_record, record_view
from .db import get_db
from .models import Evidence, Lot, Record, User
from .events import emit

router = APIRouter(prefix="/market", tags=["Hive Economy"])


class Requirement(BaseModel):
    product: Literal["honey", "beeswax"]
    quantity_g: int = Field(gt=0, le=100_000_000, strict=True)
    region: str = Field(default="", max_length=100)
    floral: str = Field(default="", max_length=100)
    max_moisture: float | None = Field(default=None, ge=0, le=100)
    delivery_by: date | None = None
    packaging: str = Field(default="Food-safe bulk containers", max_length=200)
    terms: str = Field(default="Quotation requested", max_length=500)
    target_price_minor: int | None = Field(default=None, gt=0)


class Enquiry(BaseModel):
    requirement_id: str
    lot_id: str
    message: str = Field(default="Please share a quotation and sample availability.", max_length=1000)


class EnquiryUpdate(BaseModel):
    status: Literal["quoted", "ordered", "closed"]
    quote_minor: int | None = Field(default=None, gt=0, strict=True)


@router.get("/requirements")
def requirements(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return [record_view(row) for row in db.scalars(select(Record).where(Record.kind == "requirement"))]


@router.post("/requirements", status_code=201)
def create_requirement(body: Requirement, db: Session = Depends(get_db),
                       user: User = Depends(require_roles("buyer", "processor", "fpo", "admin"))):
    return add_record(db, "requirement", user, {**body.model_dump(mode="json"), "status": "open"})


@router.get("/requirements/{requirement_id}/matches")
def matches(requirement_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    requirement = db.get(Record, requirement_id)
    if not requirement or requirement.kind != "requirement":
        raise HTTPException(404, "Requirement not found")
    candidates = db.scalars(select(Lot).where(Lot.product == requirement.data["product"],
                                             Lot.available_g > 0, Lot.status == "active"))
    supply = []
    for lot in candidates:
        reasons = match_reasons(db, lot, requirement.data)
        if reasons:
            supply.append({"lot_id": lot.id, "code": lot.code, "product": lot.product,
                           "available_g": lot.available_g, "region": lot.region, "floral": lot.floral,
                           "reasons": reasons, "supplier_org_id": lot.owner_org_id})
    # Each supplier gets an initial position before a supplier's remaining lots.
    supply.sort(key=lambda row: (row["available_g"], row["lot_id"]))
    seen, first, rest = set(), [], []
    for row in supply:
        (rest if row["supplier_org_id"] in seen else first).append(row)
        seen.add(row["supplier_org_id"])
    return {"requirement_id": requirement_id, "matches": first + rest,
            "policy": "Current evidence and available quantity first; one initial position per supplier."}


@router.get("/enquiries")
def enquiries(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(select(Record).where(Record.kind == "enquiry"))
    return [record_view(row) for row in rows if user.org_id in
            (row.org_id, row.data["supplier_org_id"])]


@router.post("/enquiries", status_code=201)
def create_enquiry(body: Enquiry, db: Session = Depends(get_db),
                   user: User = Depends(require_roles("buyer", "processor", "fpo", "admin"))):
    requirement = owned_record(db, body.requirement_id, "requirement", user)
    lot = db.get(Lot, body.lot_id)
    if not lot or not match_reasons(db, lot, requirement.data):
        raise HTTPException(409, "Lot does not meet current evidence, safety or quantity requirements")
    return add_record(db, "enquiry", user, {**body.model_dump(), "status": "requested",
        "quantity_g": requirement.data["quantity_g"], "supplier_org_id": lot.owner_org_id})


@router.patch("/enquiries/{enquiry_id}")
def update_enquiry(enquiry_id: str, body: EnquiryUpdate, db: Session = Depends(get_db),
                   user: User = Depends(require_roles("buyer", "processor", "fpo", "beekeeper", "admin"))):
    row = db.scalar(select(Record).where(Record.id == enquiry_id,
                                        Record.kind == "enquiry").with_for_update())
    if not row or user.org_id not in (row.org_id, row.data["supplier_org_id"]):
        raise HTTPException(404, "Enquiry not found")
    data = row.data
    if body.status == data["status"]:
        return record_view(row)
    if body.status == "quoted":
        if user.org_id != data["supplier_org_id"] or data["status"] != "requested":
            raise HTTPException(403, "Only the supplier can quote a new enquiry")
        if not body.quote_minor:
            raise HTTPException(422, "A quotation amount in paise is required")
    elif body.status == "ordered":
        if user.org_id != row.org_id or data["status"] != "quoted":
            raise HTTPException(403, "Only the buyer can accept a supplier quotation")
        lot = db.scalar(select(Lot).where(Lot.id == data["lot_id"]).with_for_update())
        requirement = db.get(Record, data["requirement_id"])
        if not lot or lot.owner_org_id != data["supplier_org_id"] or not match_reasons(db, lot, requirement.data):
            raise HTTPException(409, "Supply changed; request a new quotation")
        lot.available_g -= data["quantity_g"]
        db.add(Record(kind="reservation", org_id=lot.owner_org_id, data={
            "lot_id": lot.id, "quantity_g": data["quantity_g"], "enquiry_id": row.id,
            "buyer_org_id": row.org_id, "status": "reserved", "actor_id": user.id}))
    elif data["status"] == "ordered":
        raise HTTPException(409, "An accepted order requires a coordinated fulfillment or dispute; it cannot be silently closed")
    row.data = {**data, "status": body.status, "updated_by": user.id,
                "quote_minor": body.quote_minor if body.status == "quoted" else data.get("quote_minor")}
    emit(db, user, "market.enquiry.updated", row.id, {"status": body.status, "lot_id": data["lot_id"]})
    return record_view(row)


def match_reasons(db, lot, requirement):
    if safety_status(db, lot) != "active" or lot.available_g < requirement["quantity_g"] or lot.product != requirement["product"]:
        return []
    for key in ("region", "floral"):
        if requirement.get(key) and requirement[key].lower() not in getattr(lot, key).lower():
            return []
    evidence = db.scalars(select(Evidence).where(Evidence.lot_id == lot.id))
    valid = []
    for item in evidence:
        try:
            expiry = datetime.fromisoformat(item.expires_at.replace("Z", "+00:00"))
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            if expiry <= datetime.now(timezone.utc):
                continue
        except (TypeError, ValueError):
            continue
        moisture = item.summary.get("moisture_pct", item.summary.get("moisture_percent"))
        if requirement.get("max_moisture") is not None:
            if not isinstance(moisture, (int, float)) or moisture > requirement["max_moisture"]:
                continue
        valid.append(item)
    if not valid:
        return []
    return ["Available quantity meets the requirement", "Current laboratory evidence on file",
            "No active hold or recall", "Supplier diversity rotation"]
