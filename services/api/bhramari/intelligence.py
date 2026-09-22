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
ANALYTICS_VERSION = "hive-screening-1.0"


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
    scenario: Literal["normal", "heat", "brood_risk", "weight_drop", "stuck", "productivity"] = "normal"


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
    long_range = body.scenario == "productivity"
    start = datetime.now(timezone.utc) - (timedelta(days=7) if long_range else timedelta(minutes=35))
    step = timedelta(days=1) if long_range else timedelta(minutes=5)
    for index in range(8):
        values = {"temperature_c": round(33.5 + math.sin(index / 2), 2),
                  "humidity_pct": round(57 + 2 * math.cos(index / 2), 2),
                  "weight_kg": 24.0 + index / 2 if long_range else 28.0 + index / 20}
        if body.scenario == "heat" and index > 4:
            values["temperature_c"] = 40 + index / 4
        if body.scenario == "brood_risk" and index > 4:
            values["humidity_pct"] = 90 + index / 4
        if body.scenario == "weight_drop" and index > 5:
            values["weight_kg"] = 22.0
        if body.scenario == "stuck":
            values = {"temperature_c": 34.0, "humidity_pct": 57.0, "weight_kg": 28.0}
        reading = Reading(hive_id=body.hive_id, recorded_at=start + step * index, **values)
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


@router.get("/analytics")
def analytics(reserve_weight_kg: float = 20, db: Session = Depends(get_db),
              user: User = Depends(current_user)):
    if not 0 <= reserve_weight_kg <= 500:
        raise HTTPException(422, "Reserve weight must be between 0 and 500 kg")
    readings = list_records(db, "sensor_reading", user.org_id)
    hives = db.scalars(select(Hive).where(Hive.org_id == user.org_id)).all()
    return [hive_analytics(hive, readings, reserve_weight_kg) for hive in hives]


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


def hive_analytics(hive, readings, reserve_weight_kg):
    window = sorted(
        (row for row in readings if row["hive_id"] == hive.id),
        key=lambda row: row["recorded_at"],
    )[-24:]
    if not window:
        return {"hive_id": hive.id, "hive_name": hive.name, "disease_risk": "no_data",
                "health_score": None, "weight_change_kg": None, "harvestable_kg": None,
                "predicted_harvestable_kg": None, "daily_weight_trend_kg": None,
                "forecast_horizon_days": 7, "forecast_confidence": "none",
                "risk_categories": [], "confirmation_required": False, "confirmation_route": None,
                "recommendation": "Connect a sensor and collect readings before screening.",
                "confidence": "none", "signals": [], "model_version": ANALYTICS_VERSION}
    signals, risk_categories = [], []
    if sum(row["temperature_c"] > 38 for row in window) >= 2:
        risk_categories.append("heat_stress")
        signals.append("Repeated heat can accompany colony or brood stress; inspect ventilation and brood frames.")
    if sum(row["humidity_pct"] > 85 for row in window) >= 2:
        risk_categories.append("brood_disease_environment")
        signals.append("Persistent high humidity can increase brood-disease risk; inspect the hive rather than treating automatically.")
    if any(
        previous["weight_kg"] - current["weight_kg"] > 2
        and datetime.fromisoformat(current["recorded_at"]) - datetime.fromisoformat(previous["recorded_at"]) <= timedelta(hours=1)
        for previous, current in zip(window, window[1:])
    ):
        risk_categories.append("rapid_weight_loss")
        signals.append("Rapid weight loss can indicate swarm, disturbance, harvest, or sensor error; verify in person.")
    latest = window[-1]
    change = round(latest["weight_kg"] - window[0]["weight_kg"], 2)
    harvestable = round(max(0, latest["weight_kg"] - reserve_weight_kg), 2)
    forecast = productivity_forecast(window, reserve_weight_kg)
    risk = "brood_disease_risk" if "brood_disease_environment" in risk_categories else "colony_stress" if signals else "no_detected_signal"
    recommendation = (
        "Inspect the colony and escalate to a qualified mentor before treatment or harvest."
        if signals else
        "Plan a supervised harvest while preserving the configured reserve weight."
        if harvestable >= 5 and change >= 0 else
        "Continue monitoring; the configured reserve leaves no clear harvest surplus."
    )
    simulated = any(row.get("simulated", False) for row in window)
    return {"hive_id": hive.id, "hive_name": hive.name, "disease_risk": risk,
            "health_score": max(0, 100 - 25 * len(signals)), "weight_change_kg": change,
            "harvestable_kg": harvestable, "reserve_weight_kg": reserve_weight_kg,
            **forecast,
            "risk_categories": risk_categories, "confirmation_required": bool(risk_categories),
            "confirmation_route": f"/hives/{hive.id}/inspections" if risk_categories else None,
            "recommendation": recommendation, "confidence": "low" if simulated or len(window) < 12 else "medium",
            "signals": signals, "reading_count": len(window), "simulated": simulated,
            "model_version": ANALYTICS_VERSION,
            "boundary": "Sensor analytics screen risk and optimize inspection or harvest timing; they do not diagnose disease or authorize treatment."}


def productivity_forecast(window, reserve_weight_kg):
    horizon = 7
    times = [datetime.fromisoformat(row["recorded_at"]) for row in window]
    span_days = (times[-1] - times[0]).total_seconds() / 86400
    if len(window) < 4 or span_days < 1:
        return {"predicted_harvestable_kg": None, "daily_weight_trend_kg": None,
                "forecast_horizon_days": horizon, "forecast_confidence": "none"}
    days = [(value - times[0]).total_seconds() / 86400 for value in times]
    mean_day, mean_weight = sum(days) / len(days), sum(row["weight_kg"] for row in window) / len(window)
    denominator = sum((day - mean_day) ** 2 for day in days)
    daily_trend = sum((day - mean_day) * (row["weight_kg"] - mean_weight)
                      for day, row in zip(days, window)) / denominator
    predicted_weight = max(0, window[-1]["weight_kg"] + daily_trend * horizon)
    # ponytail: linear trend is the pilot baseline; replace it after labelled seasonal data exists.
    return {"predicted_harvestable_kg": round(max(0, predicted_weight - reserve_weight_kg), 2),
            "daily_weight_trend_kg": round(daily_trend, 3), "forecast_horizon_days": horizon,
            "forecast_confidence": "low" if any(row.get("simulated", False) for row in window) or len(window) < 12 else "medium"}
