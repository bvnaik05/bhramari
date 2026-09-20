from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import current_user
from .db import get_db
from .models import Checkpoint, DomainEvent, Evidence, Hive, Lot, Record, User, now

router = APIRouter(tags=["Operations dashboard"])


@router.get("/dashboard")
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    lot_query, hive_query = select(Lot), select(Hive)
    if user.role not in {"admin", "lab"}:
        lot_query = lot_query.where(Lot.owner_org_id == user.org_id)
        hive_query = hive_query.where(Hive.org_id == user.org_id)
    lots, hives = list(db.scalars(lot_query)), list(db.scalars(hive_query))
    query = select(DomainEvent)
    if user.role != "admin":
        query = query.where(DomainEvent.org_id == user.org_id)
    events = list(db.scalars(query.order_by(DomainEvent.created_at.desc())))
    records = db.scalars(select(Record).where(Record.org_id == user.org_id)).all()
    return {"hives": len(hives), "active_hives": sum(hive.status == "healthy" for hive in hives), "lots": len(lots), "available_honey_g": sum(lot.available_g for lot in lots if lot.product == "honey"), "available_beeswax_g": sum(lot.available_g for lot in lots if lot.product == "beeswax"), "pending_events": sum(not event.checkpoint_id for event in events), "anchored_events": sum(bool(event.checkpoint_id) and db.get(Checkpoint, event.checkpoint_id).status == "anchored" for event in events), "alerts": sum(hive.status != "healthy" for hive in hives), "held_lots": sum(lot.status != "active" for lot in lots), "sync_conflicts": sum(record.kind == "sync_conflict" for record in records), "recent_events": [{"id": event.id, "type": event.event_type, "subject_id": event.subject_id, "created_at": event.created_at.isoformat()} for event in events[:10]], "exceptions": [{"type": "hive_attention", "subject_id": hive.id, "message": f"{hive.name} needs a field inspection"} for hive in hives if hive.status != "healthy"], "updated_at": now().isoformat()}
