"""Deterministic hive screening. Alerts are observations, not diagnoses."""

import math
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import current_user, require_roles
from .community import add_record, list_records, owned_record, record_view
from .config import settings
from .db import get_db
from .models import Hive, Record, User

router = APIRouter(prefix="/sensors", tags=["Hive intelligence"])
MODEL_VERSION = "hive-rules-1.0"


class Reading(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    hive_id: str
    temperature_c: float = Field(ge=-40, le=85)
    humidity_pct: float = Field(ge=0, le=100)
    weight_kg: float = Field(ge=0, le=500)
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("recorded_at")
    @classmethod
    def valid_time(cls, value):
        if value.tzinfo is None:
            raise ValueError("Sensor timestamp must include a timezone")
        if value > datetime.now(timezone.utc) + timedelta(minutes=5):
            raise ValueError("Sensor timestamp is in the future")
        return value.astimezone(timezone.utc)


class Simulation(BaseModel):
    hive_id: str
    scenario: Literal["normal", "heat", "weight_drop", "stuck"] = "normal"


@router.get("/readings")
def readings(hive_id: str | None = None, db: Session = Depends(get_db),
             user: User = Depends(current_user)):
    rows = list_records(db, "sensor_reading", user.org_id)
    return [row for row in rows if not hive_id or row["hive_id"] == hive_id][:500]


@router.post("/readings", status_code=201)
def ingest(body: Reading, db: Session = Depends(get_db),
           user: User = Depends(require_roles("beekeeper", "fpo", "admin"))):
    return store_reading(db, user, body, simulated=False)


@router.post("/simulate", status_code=201)
def simulate(body: Simulation, db: Session = Depends(get_db),
             user: User = Depends(require_roles("beekeeper", "fpo", "admin"))):
    if not settings().demo:
        raise HTTPException(404, "Simulator is available only in explicit demo mode")
    rows = []
    start = datetime.now(timezone.utc) - timedelta(minutes=35)
    for index in range(8):
        values = {"temperature_c": round(33.5 + math.sin(index / 2), 2),
                  "humidity_pct": round(57 + 2 * math.cos(index / 2), 2), "weight_kg": 28.0 + index / 20}
        if body.scenario == "heat" and index > 4:
            values["temperature_c"] = 40 + index / 4
        if body.scenario == "weight_drop" and index > 5:
            values["weight_kg"] = 22.0
        if body.scenario == "stuck":
            values = {"temperature_c": 34.0, "humidity_pct": 57.0, "weight_kg": 28.0}
        reading = Reading(hive_id=body.hive_id, recorded_at=start + timedelta(minutes=index * 5), **values)
        rows.append(store_reading(db, user, reading, simulated=True))
    return {"scenario": body.scenario, "simulated": True, "readings": rows}


@router.get("/alerts")
def alerts(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = list_records(db, "sensor_alert", user.org_id)
    latest = {}
    for row in list_records(db, "sensor_reading", user.org_id):
        latest.setdefault(row["hive_id"], row)
    for hive_id, reading in latest.items():
        age = datetime.now(timezone.utc) - datetime.fromisoformat(reading["recorded_at"])
        if age > timedelta(hours=2):
            rows.append({"id": f"missing-{hive_id}", "hive_id": hive_id, "severity": "warning",
                         "rule": "missing", "explanation": "No sensor reading for over two hours. Check the device and connection.",
                         "model_version": MODEL_VERSION, "status": "open", "confidence": "rule-based",
                         "simulated": reading.get("simulated", False)})
    return rows


@router.post("/alerts/{alert_id}/acknowledge")
def acknowledge(alert_id: str, db: Session = Depends(get_db),
                 user: User = Depends(require_roles("beekeeper", "fpo", "admin"))):
    row = owned_record(db, alert_id, "sensor_alert", user)
    row.data = {**row.data, "status": "acknowledged", "acknowledged_by": user.id}
    return record_view(row)


def store_reading(db, user, body, simulated):
    hive = db.get(Hive, body.hive_id)
    if not hive or hive.org_id != user.org_id:
        raise HTTPException(404, "Hive not found in your organization")
    history = [row for row in list_records(db, "sensor_reading", user.org_id)
               if row["hive_id"] == body.hive_id]
    if any(row["recorded_at"] == body.recorded_at.isoformat() for row in history):
        raise HTTPException(409, "A reading already exists for this hive and timestamp")
    previous = sorted(history, key=lambda row: row["recorded_at"])[-4:]
    reading = add_record(db, "sensor_reading", user, {**body.model_dump(mode="json"), "simulated": simulated})
    rules = []
    if body.temperature_c > 38:
        rules.append(("temperature", "Temperature exceeded the 38°C screening threshold. Check ventilation and consult a mentor."))
    if body.humidity_pct > 85:
        rules.append(("humidity", "Humidity exceeded 85%. Check the sensor and inspect storage and ventilation."))
    if previous:
        elapsed = body.recorded_at - datetime.fromisoformat(previous[-1]["recorded_at"])
        if timedelta(0) < elapsed <= timedelta(hours=1) and previous[-1]["weight_kg"] - body.weight_kg > 2:
            rules.append(("weight_drop", "Weight dropped by more than 2 kg within one hour. Check for harvest, movement, or a sensor fault."))
    keys = ("temperature_c", "humidity_pct", "weight_kg")
    if len(previous) == 4 and all(all(row[key] == getattr(body, key) for key in keys) for row in previous):
        rules.append(("stuck", "Five identical readings may indicate a stuck sensor. Check the device."))
    for rule, explanation in rules:
        add_record(db, "sensor_alert", user, {"hive_id": body.hive_id, "reading_id": reading["id"],
            "rule": rule, "severity": "warning", "explanation": explanation,
            "model_version": MODEL_VERSION, "confidence": "rule-based", "input_window": [row["id"] for row in previous] + [reading["id"]],
            "status": "open", "simulated": simulated, "guidance": "Screening only. No automated treatment."})
    return reading
