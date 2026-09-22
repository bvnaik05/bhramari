import base64
from datetime import datetime, timedelta
from uuid import UUID

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import current_user, require_roles
from .db import get_db
from .disputes import create_review
from .events import canonical, digest, emit
from .models import Device, Record, SyncReceipt, User, now
from .schemas import DeviceInput, Envelope, HarvestInput, InspectionInput, SyncInput
from .traceability import harvest, inspect_hive, row_view

router = APIRouter(tags=["Signed offline access"])


@router.post("/devices", status_code=201)
def register(body: DeviceInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    validate_public_key(body.public_key)
    record = Device(user_id=user.id, public_key=body.public_key, name=body.name)
    db.add(record)
    db.flush()
    emit(db, user, "device.registered", record.id, {"public_key": body.public_key, "name": body.name})
    return row_view(record)


def validate_public_key(public_key):
    try:
        Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key, validate=True))
    except ValueError as exc:
        raise HTTPException(422, "Provide a base64 Ed25519 public key") from exc


@router.get("/devices")
def devices(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [row_view(row) for row in db.scalars(select(Device).where(Device.user_id == user.id))]


@router.delete("/devices/{device_id}")
def revoke(device_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    device = db.get(Device, device_id)
    if not device or device.user_id != user.id:
        raise HTTPException(404, "Device not found")
    device.revoked = True
    emit(db, user, "device.revoked", device.id, {})
    return {"id": device.id, "revoked": True}


@router.post("/devices/{device_id}/rotate", status_code=201)
def rotate(device_id: str, body: DeviceInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    validate_public_key(body.public_key)
    device = db.scalar(select(Device).where(Device.id == device_id).with_for_update())
    if not device or device.user_id != user.id:
        raise HTTPException(404, "Device not found")
    if device.revoked:
        raise HTTPException(409, "A revoked key cannot be rotated")
    replacement = Device(user_id=user.id, public_key=body.public_key, name=body.name)
    device.revoked = True
    db.add(replacement)
    db.flush()
    emit(db, user, "device.rotated", replacement.id, {"previous_device_id": device.id, "name": body.name})
    return {**row_view(replacement), "previous_device_id": device.id}


@router.post("/sync")
def sync(body: SyncInput, user: User = Depends(require_roles("beekeeper", "fpo", "processor", "admin")), db: Session = Depends(get_db)):
    receipts = []
    for envelope in body.events:
        try:
            receipts.append(accept_envelope(db, user, envelope))
        except HTTPException as exc:
            receipts.append({"event_id": envelope.event_id, "status": "rejected", "detail": exc.detail})
    return {"receipts": receipts}


def accept_envelope(db, user, envelope: Envelope):
    unsigned = envelope.model_dump(exclude={"signature"})
    envelope_hash = digest(unsigned)
    device = db.scalar(select(Device).where(Device.id == envelope.key_id).with_for_update())
    if not device or device.user_id != user.id or device.revoked:
        raise HTTPException(403, "Device key is unknown, revoked or belongs to another actor")
    if envelope.actor_id != user.id or envelope.organisation_id != user.org_id:
        raise HTTPException(403, "Signed actor and organisation must match authenticated identity")
    verify_signature(device, envelope, unsigned)
    prior = db.get(SyncReceipt, envelope.event_id)
    if prior:
        if prior.device_id != device.id or prior.envelope_hash != envelope_hash:
            raise HTTPException(409, "Event ID already exists with different signed content")
        return prior.result
    if envelope.device_sequence != device.sequence + 1 or envelope.previous_event_hash != device.last_hash:
        raise HTTPException(409, "Device sequence or previous hash conflicts; inspect receipts before retry")
    if envelope.payload_hash != digest(envelope.payload):
        raise HTTPException(422, "Payload hash mismatch")
    if envelope.attachment_hashes:
        raise HTTPException(422, "Upload evidence separately; offline attachment reconciliation is not yet available")
    try:
        with db.begin_nested():
            result = apply_event(db, user, envelope)
            result = {"event_id": envelope.event_id, "status": "accepted", **result}
            event = emit(db, user, "offline.accepted", result.get("lot_id", envelope.subject_id), {"envelope": unsigned, "signature": envelope.signature}, event_id=envelope.event_id)
            result["proof_event_id"] = event.id
    except (HTTPException, ValidationError) as exc:
        detail = exc.detail if isinstance(exc, HTTPException) else "Payload schema validation failed"
        result = {"event_id": envelope.event_id, "status": "disputed", "detail": detail}
        create_review(db, "sync_conflict", user.org_id, "offline_event", envelope.event_id, str(detail),
                      {"envelope": unsigned, "signature": envelope.signature, "detail": detail,
                       "reported_by": user.id}, due_hours=24)
        emit(db, user, "offline.disputed", envelope.subject_id, {"event_id": envelope.event_id, "envelope_hash": envelope_hash, "detail": detail})
    device.sequence, device.last_hash = envelope.device_sequence, envelope_hash
    db.add(SyncReceipt(id=envelope.event_id, device_id=device.id, envelope_hash=envelope_hash, status=result["status"], result=result))
    db.flush()
    return result


def verify_signature(device, envelope, unsigned):
    try:
        identifier = UUID(envelope.event_id)
        if identifier.version != 7:
            raise ValueError("Event ID must be UUIDv7")
        occurred = datetime.fromisoformat(envelope.occurred_at.replace("Z", "+00:00"))
        if occurred.tzinfo is None or occurred > now() + timedelta(minutes=5):
            raise ValueError("Invalid timestamp or device clock is ahead")
        key = Ed25519PublicKey.from_public_bytes(base64.b64decode(device.public_key, validate=True))
        key.verify(base64.b64decode(envelope.signature, validate=True), canonical(unsigned))
    except (InvalidSignature, ValueError) as exc:
        raise HTTPException(422, "Signature, UUIDv7 or timestamp validation failed") from exc


def apply_event(db, user, envelope):
    if envelope.event_type == "harvest":
        body = HarvestInput.model_validate(envelope.payload)
        if body.hive_id != envelope.subject_id:
            raise HTTPException(422, "Subject and payload hive do not match")
        lot = harvest(db, user, body)
        return {"lot_id": lot.id, "quantity_g": lot.quantity_g}
    body = InspectionInput.model_validate(envelope.payload)
    record = inspect_hive(db, user, envelope.subject_id, body)
    return {"inspection_id": record["id"]}


@router.get("/sync/receipts")
def receipts(user: User = Depends(current_user), db: Session = Depends(get_db)):
    ids = select(Device.id).where(Device.user_id == user.id)
    return [row.result for row in db.scalars(select(SyncReceipt).where(SyncReceipt.device_id.in_(ids)))]
