import json

from sqlalchemy import select

from bhramari.db import SessionLocal
from bhramari.models import Organisation, User
from bhramari.seed_identity import seed_identities


def test_identity_manifest_is_idempotent(tmp_path):
    source = tmp_path / "participants.json"
    source.write_text(json.dumps({
        "organisations": [{"id": "ORG-BOOTSTRAP-TEST", "name": "Bootstrap Test", "kind": "fpo"}],
        "users": [{"id": "USER-BOOTSTRAP-TEST", "email": "bootstrap-test@bhramari.local", "name": "Bootstrap Test", "org_id": "ORG-BOOTSTRAP-TEST", "role": "fpo", "oidc_subject": "kc-bootstrap-test"}],
    }))
    with SessionLocal.begin() as db:
        seed_identities(db, source)
        seed_identities(db, source)
    with SessionLocal() as db:
        assert db.get(Organisation, "ORG-BOOTSTRAP-TEST")
        assert len(db.scalars(select(User).where(User.oidc_subject == "kc-bootstrap-test")).all()) == 1
