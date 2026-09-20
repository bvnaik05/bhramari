"""Deterministic supporting fixtures for explicit demo mode."""

from datetime import timedelta

from .assisted import pin_hash
from .models import Record, now


def seed_extra(db):
    if db.get(Record, "DEMO-EQUIPMENT-001"):
        return
    salt = "00112233445566778899aabbccddeeff"
    future = (now() + timedelta(days=180)).isoformat()
    db.add_all([
        Record(id="DEMO-FARMER-CARD-001", kind="farmer_card", org_id="ORG-BEEKEEPER",
               data={"farmer_id": "USER-BEEKEEPER", "salt": salt, "pin_hash": pin_hash("2468", salt)}),
        Record(id="DEMO-DELEGATION-001", kind="assistance_delegation", org_id="ORG-BEEKEEPER",
               data={"farmer_id": "USER-BEEKEEPER", "agent_org_id": "ORG-FPO", "expires_at": future,
                     "granted": True, "actor_id": "USER-BEEKEEPER"}),
        Record(id="DEMO-EQUIPMENT-001", kind="equipment", org_id="ORG-FPO",
               data={"name": "Four-frame honey extractor", "description": "Food-contact steel; clean before and after use",
                     "location": "Sahyadri collection center", "daily_fee_minor": 15000,
                     "actor_id": "USER-FPO", "simulation": True}),
        Record(id="DEMO-REQUIREMENT-001", kind="requirement", org_id="ORG-BUYER",
               data={"product": "honey", "quantity_g": 25000, "region": "Maharashtra", "floral": "",
                     "max_moisture": 18.5, "delivery_by": (now() + timedelta(days=21)).date().isoformat(),
                     "packaging": "Food-safe bulk containers", "terms": "Sample before quotation",
                     "target_price_minor": None, "status": "open", "actor_id": "USER-BUYER", "simulation": True}),
        Record(id="DEMO-ALERT-001", kind="sensor_alert", org_id="ORG-BEEKEEPER",
               data={"hive_id": "HIVE-MH-003", "reading_id": "DEMO-READING-001", "rule": "temperature",
                     "severity": "warning", "explanation": "Temperature exceeded the 38°C screening threshold.",
                     "model_version": "hive-rules-1.0", "confidence": "rule-based", "input_window": [],
                     "status": "open", "simulated": True, "guidance": "Screening only. No automated treatment.",
                     "actor_id": "USER-BEEKEEPER"}),
        Record(id="DEMO-READING-001", kind="sensor_reading", org_id="ORG-BEEKEEPER",
               data={"hive_id": "HIVE-MH-003", "temperature_c": 39.2, "humidity_pct": 68.0,
                     "weight_kg": 27.8, "recorded_at": now().isoformat(), "simulated": True,
                     "actor_id": "USER-BEEKEEPER"}),
    ])
