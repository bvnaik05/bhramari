import base64
import hashlib
import json
import socket
import struct
from datetime import date
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .access import ancestor_ids, assert_org, descendant_ids
from .auth import current_user, require_roles
from .config import settings
from .db import get_db
from .events import emit
from .models import Evidence, Lot, Record, User, now, uid
from .schemas import ConsentInput, Input, RestrictionInput
from .traceability import row_view

router = APIRouter(tags=["Quality and consent"])


class EvidenceInput(Input):
    lot_id: str = Field(max_length=64)
    kind: str = Field(pattern="^(laboratory|inspection|storage)$")
    title: str = Field(min_length=3, max_length=150)
    content_base64: str = Field(min_length=4, max_length=2_800_000)
    content_type: str = Field(pattern="^(application/pdf|text/plain|application/json)$")
    expires_at: date
    summary: dict = Field(default_factory=dict)


@lru_cache
def evidence_cipher():
    key = settings().evidence_key
    if not key:
        if not settings().demo:
            raise HTTPException(503, "Evidence encryption key must be configured")
        path = settings().data_dir / "evidence.key"
        if not path.exists():
            path.write_bytes(Fernet.generate_key())
            path.chmod(0o600)
        key = path.read_bytes()
    return Fernet(key)


@router.post("/evidence", status_code=201)
def add_evidence(body: EvidenceInput, user: User = Depends(require_roles("lab", "fpo", "processor", "beekeeper", "admin")), db: Session = Depends(get_db)):
    lot = db.get(Lot, body.lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")
    if body.kind == "laboratory" and user.role not in {"lab", "admin"}:
        raise HTTPException(403, "Only enrolled laboratories can issue laboratory evidence")
    if user.role not in {"lab", "admin"}:
        assert_org(user, lot.owner_org_id)
    if body.expires_at < now().date():
        raise HTTPException(422, "New evidence cannot already be expired")
    content = validate_content(body)
    scan_content(content)
    identifier = uid()
    encrypted = evidence_cipher().encrypt(content)
    if settings().demo:
        # ponytail: keep demo evidence in Postgres; use object storage for larger evidence volumes.
        object_path = f"db:{encrypted.decode('ascii')}"
    else:
        directory = settings().data_dir / "evidence"
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{identifier}.enc"
        path.write_bytes(encrypted)
        object_path = str(path.resolve())
    evidence = Evidence(id=identifier, lot_id=lot.id, issuer_org_id=user.org_id, kind=body.kind, title=body.title, sha256=hashlib.sha256(content).hexdigest(), content_type=body.content_type, object_path=object_path, expires_at=body.expires_at.isoformat(), summary=body.summary)
    db.add(evidence)
    db.flush()
    emit(db, user, "evidence.issued", lot.id, {"evidence_id": evidence.id, "sha256": evidence.sha256, "kind": evidence.kind, "expires_at": evidence.expires_at})
    return {key: value for key, value in row_view(evidence).items() if key != "object_path"}


def validate_content(body):
    try:
        content = base64.b64decode(body.content_base64, validate=True)
        if len(content) > 2_000_000:
            raise ValueError("File exceeds 2 MB")
        if body.content_type == "application/pdf":
            if not content.startswith(b"%PDF-"):
                raise ValueError("PDF signature mismatch")
            if any(marker in content.lower() for marker in [b"/javascript", b"/js", b"/launch", b"/embeddedfile", b"/openaction"]):
                raise ValueError("Active PDF content is not accepted")
        else:
            text = content.decode("utf-8")
            if "\x00" in text:
                raise ValueError("Binary data in text attachment")
            if body.content_type == "application/json":
                json.loads(text)
        if len(json.dumps(body.summary)) > 8000:
            raise ValueError("Evidence summary exceeds 8 KB")
        return content
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(422, str(exc)) from exc


def scan_content(content):
    config = settings()
    if not config.malware_scanner_host:
        if config.demo:
            return
        raise HTTPException(503, "Malware scanner must be configured for evidence uploads")
    try:
        with socket.create_connection((config.malware_scanner_host, config.malware_scanner_port), timeout=10) as scanner:
            scanner.sendall(b"zINSTREAM\0")
            for start in range(0, len(content), 64 * 1024):
                chunk = content[start:start + 64 * 1024]
                scanner.sendall(struct.pack("!I", len(chunk)) + chunk)
            scanner.sendall(struct.pack("!I", 0))
            verdict = scanner.recv(4096).rstrip(b"\0").decode("utf-8", "replace")
    except OSError as exc:
        raise HTTPException(503, "Evidence malware scanner is unavailable") from exc
    if verdict.endswith(" FOUND"):
        raise HTTPException(422, "Evidence upload failed malware screening")
    if not verdict.endswith(" OK"):
        raise HTTPException(502, "Evidence malware scanner returned an invalid verdict")


@router.get("/evidence/{evidence_id}/content")
def content(evidence_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    evidence = db.get(Evidence, evidence_id)
    if not evidence:
        raise HTTPException(404, "Evidence not found")
    lot = db.get(Lot, evidence.lot_id)
    if user.org_id not in {lot.owner_org_id, evidence.issuer_org_id} and user.role != "admin":
        raise HTTPException(403, "Evidence access is restricted to its issuer and lot owner")
    try:
        from pathlib import Path
        encrypted = (evidence.object_path[3:].encode("ascii") if evidence.object_path.startswith("db:")
                     else Path(evidence.object_path).read_bytes())
        decoded = base64.b64decode(encrypted, altchars=b"-_", validate=True)
        if len(decoded) < 73 or (len(decoded) - 57) % 16:
            raise ValueError("invalid encrypted object length")
        raw = evidence_cipher().decrypt(encrypted)
        if hashlib.sha256(raw).hexdigest() != evidence.sha256:
            raise ValueError("hash mismatch")
    except (InvalidToken, OSError, ValueError) as exc:
        raise HTTPException(409, "Evidence integrity check failed; file is quarantined") from exc
    return Response(raw, media_type=evidence.content_type, headers={"Content-Disposition": f'attachment; filename="evidence-{evidence.id}"', "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"})


@router.post("/lots/{lot_id}/restriction")
def restrict(lot_id: str, body: RestrictionInput, user: User = Depends(require_roles("lab", "admin", "fpo", "processor")), db: Session = Depends(get_db)):
    lot = db.scalar(select(Lot).where(Lot.id == lot_id).with_for_update())
    if not lot:
        raise HTTPException(404, "Lot not found")
    if user.role not in {"lab", "admin"}:
        assert_org(user, lot.owner_org_id)
    affected = descendant_ids(db, lot.id)
    for row in db.scalars(select(Lot).where(Lot.id.in_(affected)).order_by(Lot.id).with_for_update()):
        if row.status != "recalled":
            row.status = body.status
    emit(db, user, f"lot.{body.status}", lot.id, {"reason": body.reason, "affected_ids": sorted(affected)})
    db.add(Record(kind="restriction", org_id=user.org_id, data={"lot_id": lot.id, "status": body.status, "reason": body.reason, "affected_ids": sorted(affected)}))
    return {"lot_id": lot.id, "status": body.status, "affected_ids": sorted(affected)}


@router.post("/consents", status_code=201)
def consent(body: ConsentInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.granted and body.expires_at <= now():
        raise HTTPException(422, "Consent expiry must be in the future")
    record = Record(kind="consent", org_id=user.org_id, data={**body.model_dump(mode="json"), "user_id": user.id})
    db.add(record)
    db.flush()
    emit(db, user, "consent.updated", user.id, record.data)
    return row_view(record)


@router.get("/consents")
def consents(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [row_view(row) for row in db.scalars(select(Record).where(Record.kind == "consent", Record.org_id == user.org_id).order_by(Record.created_at.desc())) if row.data.get("user_id") == user.id]
