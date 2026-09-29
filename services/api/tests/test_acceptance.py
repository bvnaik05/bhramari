import base64
import secrets
import time
from datetime import timedelta
from uuid import UUID

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy import select

from bhramari.db import SessionLocal
from bhramari.events import canonical, digest
from bhramari.models import DomainEvent, Evidence, now
from bhramari.quality import scan_content


def harvest(client, headers, grams=1_000):
    response = client.post("/api/v1/lots/harvest", headers=headers, json={
        "hive_id": "HIVE-MH-001", "product": "honey", "quantity_g": grams,
        "floral": "Wildflower", "notes": "Acceptance check",
    })
    assert response.status_code == 201, response.text
    return response.json()


def uuid7():
    milliseconds = int(time.time() * 1000)
    value = (milliseconds << 80) | (7 << 76) | (secrets.randbits(12) << 64) | (2 << 62) | secrets.randbits(62)
    return str(UUID(int=value))


def test_role_and_organisation_boundaries(client, auth):
    denied = client.post("/api/v1/lots/harvest", headers=auth("buyer"), json={
        "hive_id": "HIVE-MH-001", "quantity_g": 100, "product": "honey", "floral": "Wildflower",
    })
    assert denied.status_code == 403
    hidden = client.get("/api/v1/hives/HIVE-MH-001/inspections", headers=auth("fpo"))
    assert hidden.status_code == 403


def test_corrections_append_new_proof_without_rewriting_history(client, auth):
    headers = auth("beekeeper")
    lot = harvest(client, headers, 321)
    with SessionLocal() as db:
        original = db.scalar(select(DomainEvent).where(DomainEvent.subject_id == lot["id"], DomainEvent.event_type == "lot.harvested"))
        event_id, original_hash = original.id, original.hash

    corrected = client.post(f"/api/v1/events/{event_id}/corrections", headers=headers, json={
        "reason": "The field note used an incorrect container reference.",
        "changes": {"notes": "Container BHR-C-17"},
    })

    assert corrected.status_code == 201
    with SessionLocal() as db:
        assert db.get(DomainEvent, event_id).hash == original_hash
        assert db.get(DomainEvent, corrected.json()["id"]).event_type == "event.corrected"
    rows = client.get(f"/api/v1/events/{event_id}/corrections", headers=headers).json()
    assert rows[-1]["data"]["changes"] == {"notes": "Container BHR-C-17"}


def test_mass_balance_prevents_double_consumption_and_recall_reaches_children(client, auth):
    beekeeper = auth("beekeeper")
    parent = harvest(client, beekeeper)
    operation = {
        "operation": "split", "inputs": [{"lot_id": parent["id"], "quantity_g": 1_000}],
        "outputs": [{"product": "honey", "quantity_g": 600}, {"product": "honey", "quantity_g": 400}],
        "loss_g": 0, "method": "Acceptance split",
    }
    first = client.post("/api/v1/lots/operations", headers=beekeeper, json=operation)
    assert first.status_code == 201, first.text
    assert client.post("/api/v1/lots/operations", headers=beekeeper, json=operation).status_code == 409

    children = first.json()["lots"]
    recalled = client.post(f"/api/v1/lots/{parent['id']}/restriction", headers=auth("admin"), json={
        "status": "recalled", "reason": "Acceptance test recall requiring descendant propagation",
    })
    assert recalled.status_code == 200
    assert {item["id"] for item in children}.issubset(set(recalled.json()["affected_ids"]))
    statuses = {lot["id"]: lot["status"] for lot in client.get("/api/v1/lots", headers=auth("admin")).json()}
    assert all(statuses[item["id"]] == "recalled" for item in children)


def test_signed_offline_replay_is_idempotent_and_tampering_is_rejected(client, auth):
    headers = auth("beekeeper")
    key = Ed25519PrivateKey.generate()
    public = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    device = client.post("/api/v1/devices", headers=headers, json={"name": "Acceptance phone", "public_key": base64.b64encode(public).decode()}).json()
    payload = {"hive_id": "HIVE-MH-001", "product": "honey", "quantity_g": 750, "floral": "Wildflower", "notes": "Captured offline"}
    unsigned = {
        "schema_version": 1, "event_id": uuid7(), "actor_id": "USER-BEEKEEPER", "organisation_id": "ORG-BEEKEEPER",
        "event_type": "harvest", "subject_id": "HIVE-MH-001", "occurred_at": now().isoformat(), "device_sequence": 1,
        "previous_event_hash": "", "payload_hash": digest(payload), "attachment_hashes": [], "key_id": device["id"],
        "capture_mode": "OFFLINE", "payload": payload,
    }
    envelope = {**unsigned, "signature": base64.b64encode(key.sign(canonical(unsigned))).decode()}
    first = client.post("/api/v1/sync", headers=headers, json={"events": [envelope]}).json()["receipts"][0]
    replay = client.post("/api/v1/sync", headers=headers, json={"events": [envelope]}).json()["receipts"][0]
    assert first == replay and first["status"] == "accepted"

    altered = {**unsigned, "payload": {**payload, "quantity_g": 7_500}}
    altered["signature"] = base64.b64encode(key.sign(canonical(altered))).decode()
    rejected = client.post("/api/v1/sync", headers=headers, json={"events": [altered]}).json()["receipts"][0]
    assert rejected["status"] == "rejected"


def test_device_key_rotation_revokes_old_key_atomically(client, auth):
    headers = auth("beekeeper")
    first = Ed25519PrivateKey.generate().public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    second = Ed25519PrivateKey.generate().public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    device = client.post("/api/v1/devices", headers=headers, json={"name": "Old phone", "public_key": base64.b64encode(first).decode()}).json()

    rotated = client.post(f"/api/v1/devices/{device['id']}/rotate", headers=headers, json={"name": "Replacement phone", "public_key": base64.b64encode(second).decode()})

    assert rotated.status_code == 201
    devices = {item["id"]: item for item in client.get("/api/v1/devices", headers=headers).json()}
    assert devices[device["id"]]["revoked"] is True
    assert devices[rotated.json()["id"]]["revoked"] is False
    assert client.post(f"/api/v1/devices/{device['id']}/rotate", headers=headers, json={"name": "Third phone", "public_key": base64.b64encode(second).decode()}).status_code == 409


def test_encrypted_evidence_detects_mutation(client, auth):
    headers = auth("beekeeper")
    lot = harvest(client, headers, 500)
    content = b"field inspection record"
    response = client.post("/api/v1/evidence", headers=headers, json={
        "lot_id": lot["id"], "kind": "inspection", "title": "Acceptance inspection",
        "content_base64": base64.b64encode(content).decode(), "content_type": "text/plain",
        "expires_at": (now() + timedelta(days=30)).date().isoformat(), "summary": {},
    })
    assert response.status_code == 201, response.text
    evidence_id = response.json()["id"]
    assert client.get(f"/api/v1/evidence/{evidence_id}/content", headers=headers).content == content
    with SessionLocal.begin() as db:
        evidence = db.get(Evidence, evidence_id)
        assert evidence.object_path.startswith("db:")
        evidence.object_path += "tampered"
    assert client.get(f"/api/v1/evidence/{evidence_id}/content", headers=headers).status_code == 409


def test_checkpoint_receipt_is_bound_to_path_and_root(client):
    headers = {"Authorization": "Bearer test-relayer-secret"}
    checkpoint = client.get("/api/v1/trust/pending", headers=headers).json()["checkpoints"][0]
    receipt = {
        "transaction_hash": "0x" + "12" * 32, "block_number": 9, "chain_id": 31337,
        "contract_address": "0x" + "34" * 20, "checkpoint_id": checkpoint["id"],
        "merkle_root": "0x" + checkpoint["root"], "confirmations": 1,
    }
    mismatch = client.post(f"/api/v1/trust/checkpoints/{checkpoint['id']}/receipt", headers=headers, json={**receipt, "checkpoint_id": "wrong"})
    assert mismatch.status_code == 409
    anchored = client.post(f"/api/v1/trust/checkpoints/{checkpoint['id']}/receipt", headers=headers, json=receipt)
    assert anchored.status_code == 200 and anchored.json()["status"] == "anchored"


def test_public_passport_excludes_private_identity_fields(client):
    passport = client.get("/api/v1/passport/BHR-2026-0001")
    assert passport.status_code == 200
    body = passport.json()
    serialized = str(body).lower()
    assert "@bhramari.local" not in serialized
    assert "user-beekeeper" not in serialized
    assert set(body["origin"]) == {"region", "floral", "producer", "source_lots"}


def test_jar_certificate_is_verified_and_scan_is_idempotent(client, auth):
    packed = client.post("/api/v1/lots/pack", headers=auth("fpo"), json={
        "lot_id": "LOT-2026-002", "bottle_count": 1, "grams_per_bottle": 500,
    }).json()["bottles"][0]
    assert packed["certificate"] in packed["qr_payload"]
    serial = packed["serial"]
    passport = client.get(f"/api/v1/passport/{serial}").json()
    scan = {"region": "Pune, Maharashtra", "client_nonce": str(UUID(int=1)),
            "certificate": passport["certificate"]}
    first = client.post(f"/api/v1/passport/{serial}/scan", json=scan)
    replay = client.post(f"/api/v1/passport/{serial}/scan", json=scan)
    assert first.status_code == 200 and replay.status_code == 200
    assert first.json()["risk"] == replay.json()["risk"] == "normal"

    risky = client.post(f"/api/v1/passport/{serial}/scan", json={
        **scan, "region": "Delhi", "client_nonce": str(UUID(int=2)),
    })
    assert risky.status_code == 200 and risky.json()["risk"] == "review"
    control = client.get("/api/v1/control", headers=auth("fpo"))
    assert any(item["type"] == "scan_risk" for item in control.json()["exceptions"])

    payload, signature = passport["certificate"].split(".")
    replacement = "A" if signature[-1] != "A" else "B"
    tampered = client.post(f"/api/v1/passport/{serial}/scan", json={
        **scan, "client_nonce": str(UUID(int=3)), "certificate": f"{payload}.{signature[:-1]}{replacement}",
    })
    assert tampered.status_code == 422


def test_malware_verdict_rejects_evidence(monkeypatch):
    from types import SimpleNamespace
    from bhramari import quality

    class Scanner:
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def sendall(self, _): pass
        def recv(self, _): return b"stream: Eicar-Test-Signature FOUND\0"

    monkeypatch.setattr(quality, "settings", lambda: SimpleNamespace(demo=False, malware_scanner_host="scanner", malware_scanner_port=3310))
    monkeypatch.setattr(quality.socket, "create_connection", lambda *args, **kwargs: Scanner())
    try:
        scan_content(b"untrusted evidence")
        assert False, "malware verdict must reject the upload"
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 422
