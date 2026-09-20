import json

from sqlalchemy import select

from .models import Organisation, User


def seed_identities(db, source):
    """Idempotently enroll the organisations and OIDC subjects in a deployment manifest."""
    manifest = json.loads(source.read_text(encoding="utf-8"))
    for item in manifest.get("organisations", []):
        if not db.get(Organisation, item["id"]):
            db.add(Organisation(id=item["id"], name=item["name"], kind=item["kind"]))
    db.flush()
    for item in manifest.get("users", []):
        if not db.scalar(select(User).where(User.oidc_subject == item["oidc_subject"])):
            db.add(User(**item))
