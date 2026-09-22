"""Organization-scoped exception queues for cluster coordinators."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .access import safety_status
from .auth import require_roles
from .community import record_view
from .db import get_db
from .engagement import match_reasons
from .models import Checkpoint, DomainEvent, Evidence, Lot, LotEdge, Record, User

router = APIRouter(tags=["Control tower"])


@router.get("/control")
def control_tower(db: Session = Depends(get_db), user: User = Depends(require_roles("fpo", "admin", "processor", "lab"))):
    lots = list(db.scalars(select(Lot)))
    if user.role != "admin":
        lots = [lot for lot in lots if lot.owner_org_id == user.org_id]
    ids = {lot.id for lot in lots}
    events = list(db.scalars(select(DomainEvent)))
    if user.role != "admin":
        events = [event for event in events if event.org_id == user.org_id]
    records = list(db.scalars(select(Record)))
    requirements = [row for row in records if row.kind == "requirement" and row.data.get("status") == "open"]
    if user.role != "admin":
        records = [row for row in records if row.org_id == user.org_id]
    evidence = list(db.scalars(select(Evidence).where(Evidence.lot_id.in_(ids)))) if ids else []
    pending = [event for event in events if not event.checkpoint_id]
    checkpoints = {item.id: item for item in db.scalars(select(Checkpoint))}
    pending += [event for event in events if event.checkpoint_id and checkpoints[event.checkpoint_id].status != "anchored"]
    restricted = [{"id": lot.id, "code": lot.code, "status": safety_status(db, lot)} for lot in lots
                  if safety_status(db, lot) != "active"]
    expiring = [item for item in evidence if is_expiring(item.expires_at)]
    demand_gaps = [{"id": row.id, "product": row.data["product"], "quantity_g": row.data["quantity_g"],
                    "region": row.data.get("region", ""), "delivery_by": row.data.get("delivery_by")}
                   for row in requirements if not any(match_reasons(db, lot, row.data) for lot in lots)]
    exceptions = []
    for lot in restricted:
        exceptions.append({"id": lot["id"], "type": "recall" if lot["status"] == "recalled" else "hold",
                           "severity": "critical", "title": f"{lot['code']} · {lot['status']}",
                           "detail": "This lot and its descendants cannot be consumed or packed."})
    for item in expiring:
        exceptions.append({"id": item.id, "type": "evidence", "severity": "warning", "title": item.title,
                           "detail": f"Evidence expired or expires within 30 days: {item.expires_at}"})
    for gap in demand_gaps:
        exceptions.append({"id": gap["id"], "type": "demand_gap", "severity": "warning",
                           "title": f"Unmatched {gap['product']} requirement",
                           "detail": f"No evidence-complete supply covers {gap['quantity_g']} g in this scope."})
    for record in records:
        if record.kind == "sensor_alert" and record.data.get("status") == "open":
            exceptions.append({"id": record.id, "type": "hive_alert", "severity": "warning",
                               "title": record.data["rule"], "detail": record.data["explanation"]})
        if record.kind in ("concern", "scan_risk", "sync_conflict", "custody_dispute") and record.data.get("status") not in ("resolved", "rejected"):
            exceptions.append({"id": record.id, "type": record.kind, "severity": "warning",
                               "title": "Duplicate QR scan risk" if record.kind == "scan_risk" else "Review requested",
                               "detail": record.data.get("summary", "Review the original claim and preserve its evidence.")})
    anchored = [event for event in events if event.checkpoint_id and checkpoints.get(event.checkpoint_id)
                and checkpoints[event.checkpoint_id].status == "anchored"]
    parented = set(db.scalars(select(LotEdge.child_id)))
    traceable = [lot for lot in lots if lot.source_hive_id or lot.id in parented]
    audit_kpis = {"anchored_events_pct": percent(len(anchored), len(events)),
                  "traceable_lots_pct": percent(len(traceable), len(lots)),
                  "current_evidence_pct": percent(len(evidence) - len(expiring), len(evidence)),
                  "open_conflicts": sum(row.kind in ("concern", "scan_risk", "sync_conflict", "custody_dispute")
                                        and row.data.get("status") not in ("resolved", "rejected") for row in records)}
    # ponytail: direct matching is enough for cluster volumes; batch or index it when requirement counts grow.
    return {"as_of": datetime.now(timezone.utc).isoformat(), "scope": "consortium" if user.role == "admin" else "organization",
            "metrics": {"lots": len(lots), "available_g": sum(lot.available_g for lot in lots),
                         "unanchored_events": len(pending), "restricted_lots": len(restricted),
                         "expiring_evidence": len(expiring), "exceptions": len(exceptions),
                         "mentor_requests": sum(row.kind == "mentor_request" and row.data.get("status") == "requested" for row in records),
                         "demand_gaps": len(demand_gaps)},
            "audit_kpis": audit_kpis, "demand_gaps": demand_gaps,
            "exceptions": exceptions, "restricted_lots": restricted,
            "pending_events": [{"id": event.id, "type": event.event_type, "subject_id": event.subject_id} for event in pending[:100]],
            "operations": [record_view(row) for row in records if row.kind in ("booking", "mentor_request", "assisted_request")][:100],
            "claim_boundaries": ["Sensor alerts are screening, not diagnoses.", "Hashes verify record integrity, not chemical purity.",
                                  "Duplicate scan signals require human review."]}


def is_expiring(value):
    try:
        expires = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return expires < datetime.now(timezone.utc) + timedelta(days=30)
    except (ValueError, TypeError):
        return True


def percent(part, total):
    return round(part * 100 / total, 1) if total else None
