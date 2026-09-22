import base64
import json
from datetime import timedelta
from functools import lru_cache
from uuid import UUID

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .access import ancestor_ids, owned_lot, safety_status
from .auth import require_roles
from .config import settings
from .db import get_db
from .events import canonical, emit
from .languages import generate_speech, translate
from .models import Bottle, Custody, DomainEvent, Evidence, Hive, Lot, Organisation, Record, User, now, uid
from .schemas import Input, PackInput
from .traceability import consume
from .trust import event_proof

router = APIRouter(tags=["Honey Passport"])
KEY_ID = "bhramari-passport-v1"


@lru_cache
def issuer_key():
    config = settings()
    if config.passport_private_key:
        return Ed25519PrivateKey.from_private_bytes(base64.b64decode(config.passport_private_key, validate=True))
    if not config.demo:
        raise HTTPException(503, "Passport signing key must be configured")
    path = config.data_dir / "passport.key"
    if not path.exists():
        key = Ed25519PrivateKey.generate()
        path.write_bytes(key.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption()))
        path.chmod(0o600)
    return Ed25519PrivateKey.from_private_bytes(path.read_bytes())


def b64url(raw):
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def certificate(serial, lot_id, grams):
    payload = b64url(canonical({"serial": serial, "lot_id": lot_id, "quantity_g": grams, "issuer_key_id": KEY_ID, "issued_at": now().isoformat(), "v": 1}))
    return f"{payload}.{b64url(issuer_key().sign(payload.encode()))}"


def verify_certificate(signed, bottle):
    try:
        payload, signature = signed.split(".")
        issuer_key().public_key().verify(b64url_decode(signature), payload.encode())
        claims = json.loads(b64url_decode(payload))
        if claims["serial"] != bottle.serial or claims["lot_id"] != bottle.lot_id or claims["quantity_g"] != bottle.quantity_g or claims["issuer_key_id"] != KEY_ID:
            raise ValueError
        return claims
    except (InvalidSignature, KeyError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(422, "Bottle certificate is invalid or does not match this serial") from exc


def b64url_decode(value):
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


@router.get("/trust/issuer-key")
def public_key():
    raw = issuer_key().public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return {"key_id": KEY_ID, "algorithm": "Ed25519", "public_key": base64.b64encode(raw).decode()}


@router.post("/lots/pack", status_code=201)
def pack(body: PackInput, user: User = Depends(require_roles("fpo", "processor", "admin")), db: Session = Depends(get_db)):
    lot = owned_lot(db, user, body.lot_id)
    consume(db, lot, body.bottle_count * body.grams_per_bottle)
    result = []
    for _ in range(body.bottle_count):
        serial = f"BHR-{now().year}-{uid().replace('-', '')[:16].upper()}"
        signed = certificate(serial, lot.id, body.grams_per_bottle)
        bottle = Bottle(serial=serial, lot_id=lot.id, quantity_g=body.grams_per_bottle, certificate=signed)
        db.add(bottle)
        resolver = f"{settings().public_url}/passport/{serial}"
        result.append({"serial": serial, "lot_id": lot.id, "quantity_g": body.grams_per_bottle, "certificate": signed, "resolver_url": resolver, "qr_payload": f"{resolver}?certificate={signed}&key={KEY_ID}"})
    emit(db, user, "lot.packaged", lot.id, {"bottle_serials": [item["serial"] for item in result], "quantity_g": body.bottle_count * body.grams_per_bottle})
    return {"bottles": result}


@router.get("/passport/{serial}")
def passport(serial: str, db: Session = Depends(get_db)):
    bottle = db.get(Bottle, serial)
    if not bottle:
        raise HTTPException(404, "Unknown bottle serial; ask the retailer to verify it")
    verify_certificate(bottle.certificate, bottle)
    lot = db.get(Lot, bottle.lot_id)
    ids = ancestor_ids(db, lot.id)
    origins = db.scalars(select(Lot).where(Lot.id.in_(ids), Lot.source_hive_id.is_not(None)).order_by(Lot.created_at)).all()
    evidence = db.scalars(select(Evidence).where(Evidence.lot_id.in_(ids))).all()
    events = db.scalars(select(DomainEvent).where(DomainEvent.subject_id.in_(ids)).order_by(DomainEvent.created_at)).all()
    state = safety_status(db, lot)
    scans = db.scalars(select(Record).where(Record.kind == "scan_risk")).all()
    suspicious = any(record.data.get("serial") == serial for record in scans)
    proof = event_proof(db, events[-1]) if events else {"status": "awaiting_checkpoint", "receipt": {}, "root": None}
    status = "On hold/recall" if state != "active" else "Suspected duplicate" if suspicious else "Verified record" if proof["status"] == "anchored" else "Needs online refresh"
    if not bottle.active:
        status = "Unknown"
    journey = [{"title": event.event_type.replace(".", " · ").replace("_", " ").title(), "date": event.created_at.isoformat(), "detail": public_event_detail(event)} for event in events if event.event_type not in {"offline.disputed", "consent.updated"}]
    public_evidence = [{"id": item.id, "kind": item.kind, "title": "Laboratory report" if item.kind == "laboratory" else "Field evidence", "sha256": item.sha256, "expires_at": item.expires_at, "fresh": item.expires_at >= now().date().isoformat(), "summary": {key: value for key, value in item.summary.items() if key in {"moisture_percent", "test", "result", "method", "screening_only"} and isinstance(value, (int, float, bool))}} for item in evidence]
    return {"serial": serial, "status": status, "safety_status": state, "product": lot.product, "quantity_g": bottle.quantity_g, "origin": {"region": lot.region, "floral": lot.floral, "producer": producer_name(db, origins), "source_lots": len(origins)}, "journey": journey, "evidence": public_evidence, "proof": {**proof, "transaction_hash": proof.get("receipt", {}).get("transaction_hash")}, "certificate": bottle.certificate, "issuer_key_id": KEY_ID, "refreshed_at": now().isoformat(), "truth_boundary": "Blockchain proves accepted records have not changed. It does not prove chemical purity. A QR label can be copied; laboratory evidence and current recall checks remain essential."}


@router.get("/passport/{serial}/audio")
def passport_audio(serial: str, language_code: str = "en-IN", db: Session = Depends(get_db)):
    data = passport(serial, db)
    origin = data["origin"]
    text = (f"{data['status']}. {data['product']}, {data['quantity_g']} grams. "
            f"Origin: {origin['region']}. Floral source: {origin['floral']}. {data['truth_boundary']}")
    localized, _ = translate(text, language_code)
    audio, media_type, provider = generate_speech(localized, language_code)
    return Response(audio, media_type=media_type, headers={"X-Voice-Provider": provider, "Cache-Control": "public, max-age=3600"})


def producer_name(db, origins):
    if not origins:
        return "Registered producer cluster"
    hive = db.get(Hive, origins[0].source_hive_id)
    org = db.get(Organisation, hive.org_id)
    return org.name if org else "Registered producer cluster"


def public_event_detail(event):
    details = {"lot.harvested": "Harvest recorded by a registered field participant", "offline.accepted": "Signed field record accepted after device and sequence validation", "custody.proposed": "Handover proposed by the sending organisation", "custody.accepted": "Receiving organisation independently accepted custody", "evidence.issued": "A content hash preserves the integrity of issued evidence", "lot.packaged": "Unique bottle serials linked to this lot", "lot.recalled": "An authorised participant issued a recall", "lot.held": "Distribution is paused for review"}
    return details.get(event.event_type, "Traceability event recorded")


class ScanInput(Input):
    region: str = Field(min_length=2, max_length=100)
    client_nonce: str = Field(min_length=36, max_length=36)
    certificate: str | None = Field(default=None, min_length=100, max_length=1000)


@router.post("/passport/{serial}/scan")
def scan(serial: str, body: ScanInput, db: Session = Depends(get_db)):
    bottle = db.get(Bottle, serial)
    if not bottle:
        raise HTTPException(404, "Unknown serial")
    if body.certificate:
        verify_certificate(body.certificate, bottle)
        if body.certificate != bottle.certificate:
            raise HTTPException(409, "Label certificate does not match the issued certificate")
    try:
        UUID(body.client_nonce)
    except ValueError as exc:
        raise HTTPException(422, "Scan nonce must be a UUID") from exc
    previous = db.scalars(select(Record).where(Record.kind == "scan", Record.created_at > now() - timedelta(minutes=10))).all()
    related = [row for row in previous if row.data.get("serial") == serial]
    duplicate_nonce = any(row.data.get("client_nonce") == body.client_nonce for row in related)
    risk = len(related) >= 5 or any(row.data.get("region", "").casefold() != body.region.casefold() for row in related)
    if not duplicate_nonce:
        db.add(Record(kind="scan", org_id="public", data={"serial": serial, **body.model_dump(exclude={"certificate"})}))
        if risk:
            lot = db.get(Lot, bottle.lot_id)
            db.add(Record(kind="scan_risk", org_id=lot.owner_org_id, data={"serial": serial, "reason": "Rapid scans from different stated regions or repeated scans; human review required"}))
    db.flush()
    return {"risk": "review" if risk else "normal", "message": "A scan pattern needs review; this is not proof of counterfeit honey" if risk else "Serial resolved. Check the label seal and live safety state.", "passport": passport(serial, db)}


class ConcernInput(Input):
    category: str = Field(pattern="^(label|quality|origin|other)$")
    description: str = Field(min_length=10, max_length=2000)


@router.post("/passport/{serial}/concerns", status_code=201)
def concern(serial: str, body: ConcernInput, db: Session = Depends(get_db)):
    bottle = db.get(Bottle, serial)
    if not bottle:
        raise HTTPException(404, "Unknown serial")
    lot = db.get(Lot, bottle.lot_id)
    record = Record(kind="concern", org_id=lot.owner_org_id, data={"serial": serial, **body.model_dump(), "status": "open"})
    db.add(record)
    db.flush()
    return {"id": record.id, "status": "open", "message": "Concern recorded for an authorised quality reviewer"}
