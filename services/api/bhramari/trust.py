import hashlib
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import relayer
from .db import get_db
from .models import Checkpoint, DomainEvent, uid
from .schemas import Input

router = APIRouter(prefix="/trust", tags=["Blockchain checkpoints"])


def merkle_parent(left, right):
    return hashlib.sha256(b"".join(sorted([bytes.fromhex(left), bytes.fromhex(right)]))).hexdigest()


def merkle_root(leaves):
    level = list(leaves)
    if not level:
        raise ValueError("Merkle tree needs at least one leaf")
    while len(level) > 1:
        level = [merkle_parent(level[index], level[min(index + 1, len(level) - 1)]) for index in range(0, len(level), 2)]
    return level[0]


def merkle_proof(leaves, index):
    level, siblings = list(leaves), []
    while len(level) > 1:
        siblings.append(level[min(index ^ 1, len(level) - 1)])
        level = [merkle_parent(level[item], level[min(item + 1, len(level) - 1)]) for item in range(0, len(level), 2)]
        index //= 2
    return siblings


def create_checkpoint(db):
    events = db.scalars(select(DomainEvent).where(DomainEvent.checkpoint_id.is_(None)).order_by(DomainEvent.created_at, DomainEvent.id).limit(500).with_for_update(skip_locked=True)).all()
    if not events:
        return None
    leaves = [event.hash for event in events]
    checkpoint = Checkpoint(id=uid(), root=merkle_root(leaves), event_ids=[event.id for event in events], leaves=leaves)
    db.add(checkpoint)
    for event in events:
        event.checkpoint_id = checkpoint.id
    db.flush()
    return checkpoint


@router.get("/pending", dependencies=[Depends(relayer)])
def pending(db: Session = Depends(get_db)):
    create_checkpoint(db)
    rows = db.scalars(select(Checkpoint).where(Checkpoint.status == "pending").order_by(Checkpoint.created_at))
    return {"checkpoints": [{"id": row.id, "root": row.root, "event_count": len(row.event_ids)} for row in rows]}


class ReceiptInput(Input):
    transaction_hash: str = Field(pattern=r"^0x[0-9a-fA-F]{64}$")
    block_number: int = Field(ge=0, strict=True)
    chain_id: int = Field(gt=0, strict=True)
    contract_address: str = Field(pattern=r"^0x[0-9a-fA-F]{40}$")
    block_hash: str | None = Field(default=None, pattern=r"^0x[0-9a-fA-F]{64}$")
    checkpoint_id: str | None = None
    merkle_root: str | None = None
    confirmations: int = Field(default=1, ge=1, strict=True)


@router.post("/checkpoints/{checkpoint_id}/receipt", dependencies=[Depends(relayer)])
def receipt(checkpoint_id: str, body: ReceiptInput, db: Session = Depends(get_db)):
    checkpoint = db.scalar(select(Checkpoint).where(Checkpoint.id == checkpoint_id).with_for_update())
    if not checkpoint:
        raise HTTPException(404, "Checkpoint not found")
    if body.checkpoint_id and body.checkpoint_id != checkpoint.id:
        raise HTTPException(409, "Receipt checkpoint ID does not match the request path")
    if body.merkle_root and body.merkle_root.removeprefix("0x").lower() != checkpoint.root:
        raise HTTPException(409, "Receipt root does not match this checkpoint")
    if checkpoint.status == "anchored" and checkpoint.receipt.get("transaction_hash") != body.transaction_hash:
        raise HTTPException(409, "Checkpoint already has a different immutable receipt")
    checkpoint.receipt = body.model_dump(exclude_none=True)
    checkpoint.status = "anchored"
    return {"id": checkpoint.id, "status": checkpoint.status, "root": checkpoint.root, "receipt": checkpoint.receipt}


def event_proof(db, event):
    checkpoint = db.get(Checkpoint, event.checkpoint_id) if event.checkpoint_id else None
    if not checkpoint:
        return {"event_id": event.id, "leaf": event.hash, "siblings": [], "root": None, "status": "awaiting_checkpoint", "checkpoint_id": None, "receipt": {}}
    index = checkpoint.event_ids.index(event.id)
    return {"event_id": event.id, "leaf": event.hash, "siblings": merkle_proof(checkpoint.leaves, index), "root": checkpoint.root, "status": checkpoint.status, "checkpoint_id": checkpoint.id, "receipt": checkpoint.receipt}


@router.get("/events/{event_id}/proof")
def proof(event_id: str, db: Session = Depends(get_db)):
    event = db.get(DomainEvent, event_id)
    if not event:
        raise HTTPException(404, "Event proof not found")
    return event_proof(db, event)
