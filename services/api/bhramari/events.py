import hashlib
import json

from .models import DomainEvent, now, uid


def canonical(value):
    # Payload schemas allow integer quantities only; sorted UTF-8 JSON is shared with field clients.
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def emit(db, user, event_type, subject_id, payload, event_id=None):
    event_id = event_id or uid()
    envelope = {"id": event_id, "actor_id": user.id, "org_id": user.org_id, "event_type": event_type, "subject_id": subject_id, "payload": payload, "occurred_at": now().isoformat()}
    event = DomainEvent(id=event_id, actor_id=user.id, org_id=user.org_id, event_type=event_type, subject_id=subject_id, payload=envelope, hash=digest(envelope))
    db.add(event)
    db.flush()
    return event
