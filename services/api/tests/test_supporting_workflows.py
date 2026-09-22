from datetime import datetime, timedelta, timezone


def test_market_filters_evidence_and_reserves_once(client, auth):
    buyer = auth("buyer")
    matches = client.get("/api/v1/market/requirements/DEMO-REQUIREMENT-001/matches", headers=buyer)
    assert matches.status_code == 200, matches.text
    lot = next(item for item in matches.json()["matches"] if item["lot_id"] == "LOT-2026-001")
    enquiry = client.post("/api/v1/market/enquiries", headers=buyer, json={
        "requirement_id": "DEMO-REQUIREMENT-001", "lot_id": lot["lot_id"], "message": "Please quote this verified lot."
    })
    assert enquiry.status_code == 201, enquiry.text
    enquiry_id = enquiry.json()["id"]
    quote = client.patch(f"/api/v1/market/enquiries/{enquiry_id}", headers=auth("beekeeper"),
                         json={"status": "quoted", "quote_minor": 460000})
    assert quote.status_code == 200, quote.text
    order = client.patch(f"/api/v1/market/enquiries/{enquiry_id}", headers=buyer,
                         json={"status": "ordered"})
    assert order.status_code == 200, order.text
    replay = client.patch(f"/api/v1/market/enquiries/{enquiry_id}", headers=buyer,
                          json={"status": "ordered"})
    assert replay.status_code == 200
    lots = client.get("/api/v1/lots", headers=auth("beekeeper")).json()
    assert next(item for item in lots if item["id"] == "LOT-2026-001")["available_g"] == 115000


def test_control_tower_reports_demand_and_audit_gaps(client, auth):
    requirement = client.post("/api/v1/market/requirements", headers=auth("buyer"), json={
        "product": "honey", "quantity_g": 100_000_000, "region": "Maharashtra",
    })
    assert requirement.status_code == 201, requirement.text

    control = client.get("/api/v1/control", headers=auth("admin"))
    assert control.status_code == 200, control.text
    body = control.json()
    assert any(item["id"] == requirement.json()["id"] for item in body["demand_gaps"])
    assert body["metrics"]["demand_gaps"] >= 1
    assert set(body["audit_kpis"]) == {
        "anchored_events_pct", "traceable_lots_pct", "current_evidence_pct", "open_conflicts",
    }


def test_assisted_harvest_needs_delegation_and_farmer_confirmation(client, auth):
    fpo = auth("fpo")
    farmers = client.get("/api/v1/assisted/farmers", headers=fpo)
    assert farmers.status_code == 200 and farmers.json()[0]["id"] == "USER-BEEKEEPER"
    request = client.post("/api/v1/assisted/requests", headers=fpo, json={
        "farmer_name": "Asha Patil", "farmer_id": "USER-BEEKEEPER", "phone_last4": "7742",
        "language": "kn-IN", "request_type": "harvest", "quantity_g": 18000, "hive_id": "HIVE-MH-001"
    })
    assert request.status_code == 201, request.text
    request_id = request.json()["id"]
    denied = client.post(f"/api/v1/assisted/requests/{request_id}/confirm", headers=fpo,
                         json={"consent_method": "pin", "confirmation": "0000"})
    assert denied.status_code == 403
    accepted = client.post(f"/api/v1/assisted/requests/{request_id}/confirm", headers=fpo,
                           json={"consent_method": "pin", "confirmation": "2468"})
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["outcome"]["lot_id"]
    assert accepted.json()["attestation_status"] == "simulated_agent_session"


def test_sensor_rules_and_equipment_conflict_are_explainable(client, auth):
    beekeeper = auth("beekeeper")
    simulated = client.post("/api/v1/sensors/simulate", headers=beekeeper,
                            json={"hive_id": "HIVE-MH-001", "scenario": "heat"})
    assert simulated.status_code == 201, simulated.text
    alerts = client.get("/api/v1/sensors/alerts", headers=beekeeper).json()
    assert any(item["rule"] == "temperature" and item["confidence"] == "rule-based" for item in alerts)
    analytics = client.get("/api/v1/sensors/analytics?reserve_weight_kg=20", headers=beekeeper).json()
    hive = next(item for item in analytics if item["hive_id"] == "HIVE-MH-001")
    assert hive["disease_risk"] == "colony_stress"
    assert hive["risk_categories"] == ["heat_stress"]
    assert hive["confirmation_required"] is True
    assert hive["confirmation_route"] == "/hives/HIVE-MH-001/inspections"
    assert hive["health_score"] < 100
    assert hive["harvestable_kg"] >= 0
    assert hive["confidence"] == "low" and hive["signals"]

    forecast_feed = client.post("/api/v1/sensors/simulate", headers=beekeeper,
                                json={"hive_id": "HIVE-MH-002", "scenario": "productivity"})
    assert forecast_feed.status_code == 201, forecast_feed.text
    analytics = client.get("/api/v1/sensors/analytics?reserve_weight_kg=20", headers=beekeeper).json()
    forecast = next(item for item in analytics if item["hive_id"] == "HIVE-MH-002")
    assert forecast["predicted_harvestable_kg"] > forecast["harvestable_kg"]
    assert forecast["forecast_horizon_days"] == 7
    assert forecast["forecast_confidence"] == "low"

    brood_feed = client.post("/api/v1/sensors/simulate", headers=beekeeper,
                             json={"hive_id": "HIVE-MH-003", "scenario": "brood_risk"})
    assert brood_feed.status_code == 201, brood_feed.text
    analytics = client.get("/api/v1/sensors/analytics", headers=beekeeper).json()
    brood_risk = next(item for item in analytics if item["hive_id"] == "HIVE-MH-003")
    assert brood_risk["disease_risk"] == "brood_disease_risk"
    assert "brood_disease_environment" in brood_risk["risk_categories"]

    fpo = auth("fpo")
    equipment = client.get("/api/v1/circles/equipment", headers=fpo).json()[0]
    start = datetime.now(timezone.utc) + timedelta(days=2)
    body = {"equipment_id": equipment["id"], "starts_at": start.isoformat(),
            "ends_at": (start + timedelta(hours=4)).isoformat()}
    booked = client.post("/api/v1/circles/bookings", headers=fpo, json=body)
    assert booked.status_code == 201, booked.text
    conflict = client.post("/api/v1/circles/bookings", headers=fpo, json=body)
    assert conflict.status_code == 409


def test_madhu_uses_capabilities_and_requires_confirmation(client, auth):
    headers = auth("beekeeper")
    draft = client.post("/api/v1/madhu/chat", headers=headers, json={
        "message": "harvest 2 kg", "language": "en-IN", "context_id": "HIVE-MH-002"
    })
    assert draft.status_code == 200, draft.text
    assert draft.json()["requires_confirmation"] is True
    lots_before = len(client.get("/api/v1/lots", headers=headers).json())
    confirmed = client.post("/api/v1/madhu/chat", headers=headers, json={
        "message": "confirm", "language": "en-IN", "confirmation_id": draft.json()["confirmation_id"]
    })
    assert confirmed.status_code == 200, confirmed.text
    assert len(client.get("/api/v1/lots", headers=headers).json()) == lots_before + 1
    unsupported = client.post("/api/v1/madhu/chat", headers=headers,
                              json={"message": "hello", "language": "xx-IN"})
    assert unsupported.status_code == 422
