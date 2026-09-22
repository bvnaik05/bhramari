"""Owned review queue for operational disputes and risk reports."""

from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import current_user
from .community import record_view
from .db import get_db
from .events import emit
from .models import Record, User, now

router = APIRouter(prefix="/disputes", tags=["Dispute resolution"])
REVIEW_KINDS = ("concern", "scan_risk", "sync_conflict", "custody_dispute")
FINAL_STATES = ("resolved", "rejected")


class DisputeUpdate(BaseModel):
    status: Literal["under_review", "resolved", "rejected"]
    resolution: str = Field(default="", max_length=2000)


@router.get("")
def disputes(db: Session = Depends(get_db), user: User = Depends(current_user)):
    query = select(Record).where(Record.kind.in_(REVIEW_KINDS)).order_by(Record.created_at.desc())
    if user.role != "admin":
        query = query.where(Record.org_id == user.org_id)
    return [record_view(row) for row in db.scalars(query)]


@router.patch("/{dispute_id}")
def update_dispute(dispute_id: str, body: DisputeUpdate, db: Session = Depends(get_db),
                   user: User = Depends(current_user)):
    row = db.scalar(select(Record).where(Record.id == dispute_id,
                                         Record.kind.in_(REVIEW_KINDS)).with_for_update())
    if not row or user.role != "admin" and row.org_id != user.org_id:
        raise HTTPException(404, "Dispute not found in your scope")
    current = row.data.get("status", "open")
    allowed = {"open": ("under_review",), "under_review": FINAL_STATES}
    if body.status not in allowed.get(current, ()):
        raise HTTPException(409, f"Dispute cannot move from {current} to {body.status}")
    if body.status in FINAL_STATES and len(body.resolution.strip()) < 8:
        raise HTTPException(422, "A final resolution needs at least 8 characters")
    changed_at = now().isoformat()
    history = [*row.data.get("history", []), {"status": body.status, "actor_id": user.id,
                                               "at": changed_at, "resolution": body.resolution}]
    row.data = {**row.data, "status": body.status, "assigned_to": row.data.get("assigned_to") or user.id,
                "resolution": body.resolution if body.status in FINAL_STATES else "", "history": history,
                "resolved_at": changed_at if body.status in FINAL_STATES else None}
    emit(db, user, "dispute.status_changed", row.data["source_id"],
         {"dispute_id": row.id, "status": body.status})
    return record_view(row)


def create_review(db, kind, org_id, source_kind, source_id, summary, data=None, due_hours=48):
    row = Record(kind=kind, org_id=org_id, data={**(data or {}), "source_kind": source_kind,
        "source_id": source_id, "summary": summary, "status": "open", "assigned_to": None,
        "due_at": (now() + timedelta(hours=due_hours)).isoformat(), "history": []})
    db.add(row)
    db.flush()
    return row
