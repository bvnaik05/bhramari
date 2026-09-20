"""Feature-phone simulator and accountable agent-assisted farmer requests."""

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from typing import Literal

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import current_user, require_roles
from .community import add_record, list_records, owned_record, record_view
from .config import settings
from .db import get_db
from .events import canonical, emit
from .languages import language
from .models import Device, Hive, Record, User
from .schemas import HarvestInput

router = APIRouter(prefix="/assisted", tags=["Inclusive access"])


class FarmerCard(BaseModel):
    pin: str = Field(pattern=r"^\d{4,8}$")


class Delegation(BaseModel):
    agent_org_id: str
    expires_at: datetime
    granted: bool = True


class AssistanceRequest(BaseModel):
    farmer_name: str = Field(min_length=2, max_length=120)
    farmer_id: str | None = None
    phone_last4: str = Field(pattern=r"^\d{4}$")
    language: str = "en-IN"
    request_type: Literal["harvest", "mentor", "buyer"]
    quantity_g: int | None = Field(default=None, gt=0, le=10_000_000, strict=True)
    hive_id: str | None = None

    @field_validator("language")
    @classmethod
    def supported_language(cls, value):
        language(value)
        return value


class Confirmation(BaseModel):
    consent_method: Literal["pin", "voice", "otp"]
    confirmation: str = Field(min_length=4, max_length=500)
    key_id: str | None = None
    signature: str | None = None


@router.post("/farmer-card")
def enroll_card(body: FarmerCard, db: Session = Depends(get_db),
                user: User = Depends(require_roles("beekeeper"))):
    card = next((row for row in db.scalars(select(Record).where(Record.kind == "farmer_card",
                  Record.org_id == user.org_id)) if row.data["farmer_id"] == user.id), None)
    salt = secrets.token_hex(16)
    data = {"farmer_id": user.id, "salt": salt, "pin_hash": pin_hash(body.pin, salt)}
    if card:
        card.data = data
    else:
        card = Record(kind="farmer_card", org_id=user.org_id, data=data)
        db.add(card)
    db.flush()
    emit(db, user, "farmer_card.enrolled", card.id, {"farmer_id": user.id})
    return {"id": card.id, "farmer_id": user.id, "status": "active"}


@router.get("/requests")
def requests(db: Session = Depends(get_db), user: User = Depends(require_roles("fpo", "admin", "beekeeper"))):
    if user.role == "beekeeper":
        return [record_view(row) for row in db.scalars(select(Record).where(Record.kind == "assisted_request"))
                if row.data["farmer_id"] == user.id]
    return list_records(db, "assisted_request", user.org_id)


@router.post("/delegations", status_code=201)
def delegate(body: Delegation, db: Session = Depends(get_db),
             user: User = Depends(require_roles("beekeeper"))):
    from .models import Organisation
    if not db.get(Organisation, body.agent_org_id):
        raise HTTPException(404, "Agent organization not found")
    if body.expires_at.tzinfo is None or body.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(422, "Include a future consent expiry and timezone")
    for row in db.scalars(select(Record).where(Record.kind == "assistance_delegation", Record.org_id == user.org_id)):
        if row.data["farmer_id"] == user.id and row.data["agent_org_id"] == body.agent_org_id:
            row.data = {**row.data, "granted": False}
    return add_record(db, "assistance_delegation", user, {**body.model_dump(mode="json"), "farmer_id": user.id})


@router.get("/farmers")
def farmers(db: Session = Depends(get_db), user: User = Depends(require_roles("fpo", "admin"))):
    result = []
    for farmer in db.scalars(select(User).where(User.role == "beekeeper", User.active.is_(True))):
        if not can_assist(db, user, farmer):
            continue
        hives = db.scalars(select(Hive).where(Hive.org_id == farmer.org_id))
        result.append({"id": farmer.id, "name": farmer.name,
                       "hives": [{"id": hive.id, "name": hive.name} for hive in hives]})
    return result


@router.post("/requests", status_code=201)
def create_request(body: AssistanceRequest, db: Session = Depends(get_db),
                   user: User = Depends(require_roles("fpo", "admin"))):
    farmers = [farmer for farmer in db.scalars(select(User).where(User.role == "beekeeper", User.active.is_(True)))
               if can_assist(db, user, farmer)]
    farmer = next((row for row in farmers if row.id == body.farmer_id), None)
    if not body.farmer_id and settings().demo and farmers:
        farmer = farmers[0]
    if not farmer:
        raise HTTPException(422, "Scan an enrolled Farmer Card from your organization")
    if body.request_type == "harvest":
        hive = db.get(Hive, body.hive_id)
        if not hive or hive.org_id != farmer.org_id or not body.quantity_g:
            raise HTTPException(422, "Select the farmer's registered hive and harvest quantity")
    return add_record(db, "assisted_request", user, {**body.model_dump(), "farmer_id": farmer.id,
        "status": "pending_confirmation", "capture_mode": "ASSISTED", "attempts": 0,
        "channel": "simulated_ivr" if settings().demo else "agent", "agent_id": user.id})


@router.post("/requests/{request_id}/confirm")
def confirm_request(request_id: str, body: Confirmation, db: Session = Depends(get_db),
                    user: User = Depends(require_roles("fpo", "admin"))):
    row = owned_record(db, request_id, "assisted_request", user, lock=True)
    if row.data["status"] == "completed":
        return record_view(row)
    if row.data["attempts"] >= 5:
        raise HTTPException(423, "Confirmation is locked. Start a reviewed request after verifying the farmer.")
    if body.consent_method != "pin":
        raise HTTPException(422, "Use the Farmer Card PIN. Production voice and OTP need a connected consent provider.")
    farmer = db.get(User, row.data["farmer_id"])
    if not farmer or not farmer.active or not can_assist(db, user, farmer):
        raise HTTPException(403, "Farmer account is unavailable")
    card = next((item for item in db.scalars(select(Record).where(Record.kind == "farmer_card",
                   Record.org_id == farmer.org_id)) if item.data["farmer_id"] == farmer.id), None)
    verified = card and hmac.compare_digest(card.data["pin_hash"], pin_hash(body.confirmation, card.data["salt"]))
    if not card and settings().demo:
        verified = hmac.compare_digest(body.confirmation, "2468")
    if not verified:
        row.data = {**row.data, "attempts": row.data["attempts"] + 1}
        db.commit()  # Failed attempts must survive the rejected request.
        raise HTTPException(403, "Farmer confirmation failed")
    attestation = {"request_id": row.id, "agent_id": user.id, "farmer_id": farmer.id,
                   "consent_method": "pin", "quantity_g": row.data.get("quantity_g"),
                   "hive_id": row.data.get("hive_id")}
    signed = verify_attestation(db, user, body, attestation)
    outcome = complete_request(db, user, farmer, row)
    row.data = {**row.data, "status": "completed", "consent_method": body.consent_method,
                "confirmed_at": datetime.now(timezone.utc).isoformat(), "outcome": outcome,
                "attestation": attestation, "signature": body.signature, "key_id": body.key_id,
                "attestation_status": "device_signed" if signed else "simulated_agent_session"}
    emit(db, user, "request.assisted.confirmed", row.id, row.data)
    return record_view(row)


def complete_request(db, agent, farmer, row):
    if row.data["request_type"] == "harvest":
        from .traceability import harvest
        body = HarvestInput(hive_id=row.data["hive_id"], quantity_g=row.data["quantity_g"],
                            notes=f"Assisted request {row.id}")
        lot = harvest(db, farmer, body)
        emit(db, agent, "harvest.assisted", lot.id, {"capture_mode": "ASSISTED", "farmer_id": farmer.id,
                                                   "consent_method": "pin", "request_id": row.id})
        return {"lot_id": lot.id, "code": lot.code}
    kind = "mentor_request" if row.data["request_type"] == "mentor" else "buyer_support"
    return add_record(db, kind, farmer, {"question": "Farmer requested a callback through assisted access.",
                                        "status": "requested", "assisted_request_id": row.id})


def verify_attestation(db, user, body, attestation):
    if not body.key_id or not body.signature:
        if settings().demo:
            return False
        raise HTTPException(422, "Register an agent device and sign the confirmation attestation")
    device = db.get(Device, body.key_id)
    if not device or device.user_id != user.id or device.revoked:
        raise HTTPException(403, "Agent device is unavailable")
    try:
        key = Ed25519PublicKey.from_public_bytes(base64.b64decode(device.public_key, validate=True))
        key.verify(base64.b64decode(body.signature, validate=True), canonical(attestation))
    except (ValueError, InvalidSignature) as exc:
        raise HTTPException(403, "Invalid agent signature") from exc
    return True


def pin_hash(pin, salt):
    return hashlib.scrypt(pin.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


def can_assist(db, agent, farmer):
    for row in db.scalars(select(Record).where(Record.kind == "assistance_delegation", Record.org_id == farmer.org_id)):
        data = row.data
        if data["farmer_id"] == farmer.id and data["agent_org_id"] == agent.org_id and data["granted"]:
            if datetime.fromisoformat(data["expires_at"]) > datetime.now(timezone.utc):
                return True
    return False
