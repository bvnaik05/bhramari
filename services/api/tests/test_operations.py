def test_health_and_metrics_are_available_without_authentication(client):
    assert client.get("/api/v1/health").json()["status"] == "ok"
    metrics = client.get("/metrics")
    assert metrics.status_code == 200
    assert "bhramari_http_requests_total" in metrics.text


def test_custody_dispute_has_owner_sla_and_resolution(client, auth):
    proposed = client.post("/api/v1/custody", headers=auth("beekeeper"), json={
        "lot_id": "LOT-2026-001", "to_org_id": "ORG-FPO", "note": "Count at dispatch",
    })
    assert proposed.status_code == 201, proposed.text
    disputed = client.post(f"/api/v1/custody/{proposed.json()['id']}/decision", headers=auth("fpo"), json={
        "decision": "disputed", "note": "Received quantity does not match the handover.",
    })
    assert disputed.status_code == 200, disputed.text

    queue = client.get("/api/v1/disputes", headers=auth("beekeeper"))
    item = next(row for row in queue.json() if row["source_id"] == proposed.json()["id"])
    assert item["status"] == "open" and item["assigned_to"] is None and item["due_at"]
    claimed = client.patch(f"/api/v1/disputes/{item['id']}", headers=auth("beekeeper"),
                           json={"status": "under_review", "resolution": ""})
    assert claimed.status_code == 200 and claimed.json()["assigned_to"] == "USER-BEEKEEPER"
    resolved = client.patch(f"/api/v1/disputes/{item['id']}", headers=auth("beekeeper"), json={
        "status": "resolved", "resolution": "Both parties accepted the corrected quantity record.",
    })
    assert resolved.status_code == 200 and resolved.json()["status"] == "resolved"
    assert len(resolved.json()["history"]) == 2
