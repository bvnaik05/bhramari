"""Role-aware operating assistant with deterministic, multilingual fallback."""

import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .access import ancestor_ids, owned_lot, safety_status
from .auth import current_user
from .community import add_record, list_records, owned_record
from .db import get_db
from .events import emit
from .languages import language, to_english, translate
from .models import Evidence, Hive, Lot, Record, User
from .schemas import HarvestInput, InspectionInput

router = APIRouter(prefix="/madhu", tags=["Madhu"])
SOURCE = {"title": "Bhramari field and traceability procedures", "version": "1.0",
          "reviewed_at": "2026-09-20", "url": "/docs/madhu-procedures", "scope": "Operational guidance; not veterinary or laboratory advice"}
MESSAGES = {"welcome": "I can check your hives, draft a harvest, check stock and evidence, or request a mentor. Select a hive or lot for context.",
            "safety": "This needs a qualified human. I cannot diagnose, prescribe treatment, certify purity, issue a recall, or make a credit decision. I can help you request a mentor.",
            "draft": "Please review this draft. Nothing is saved until you explicitly confirm.",
            "done": "Confirmed. Your request is saved with an audit record.",
            "context": "Select a hive or lot so I can use your authorized records.",
            "quantity": "Include a whole-gram quantity, for example: harvest 18 kg."}


class Chat(BaseModel):
    message: str = Field(default="", max_length=2000)
    language: str = "en-IN"
    context_id: str | None = Field(default=None, max_length=64)
    confirmation_id: str | None = None

    @field_validator("language")
    @classmethod
    def supported_language(cls, value):
        language(value)
        return value


@router.post("/chat")
def chat(body: Chat, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if body.confirmation_id:
        return confirm_action(db, user, body)
    text = to_english(body.message, body.language).lower()
    if has(text, ["treatment", "medicine", "dose", "certify", "purity", "recall", "loan"]):
        return response(body, MESSAGES["safety"], "escalation", escalation="qualified_human", tools=[])
    if has(text, ["mentor", "concern", "help hive"]):
        return draft_action(db, user, body, "request_mentor", {"question": body.message, "hive_id": body.context_id})
    if has(text, ["harvest", "extract honey"]):
        if user.role not in ("beekeeper", "fpo", "admin"):
            raise HTTPException(403, "Your role cannot capture a harvest")
        hive = authorized_hive(db, user, body.context_id)
        if not hive:
            return response(body, MESSAGES["context"], "draft_harvest")
        grams = parse_grams(text)
        if not grams:
            return response(body, MESSAGES["quantity"], "draft_harvest")
        payload = HarvestInput(hive_id=hive.id, quantity_g=grams, floral=hive.floral).model_dump()
        return draft_action(db, user, body, "draft_harvest", payload)
    if has(text, ["inspect", "inspection"]):
        if user.role not in ("beekeeper", "fpo", "admin"):
            raise HTTPException(403, "Your role cannot record an inspection")
        hive = authorized_hive(db, user, body.context_id)
        if not hive:
            return response(body, MESSAGES["context"], "draft_inspection")
        return draft_action(db, user, body, "draft_inspection", {
            "hive_id": hive.id, "observation": body.message, "status": "attention"})
    return read_context(db, user, body)


def read_context(db, user, body):
    text = to_english(body.message, body.language).lower()
    if has(text, ["buyer", "demand"]):
        rows = db.scalars(select(Record).where(Record.kind == "requirement")).all()
        data = [{"id": row.id, "product": row.data["product"], "quantity_g": row.data["quantity_g"]} for row in rows]
        return response(body, f"{len(data)} buyer requirements are available. Review evidence and availability before an enquiry.",
                        "find_buyer_demand", data=data, tools=["find_buyer_demand"])
    if has(text, ["equipment", "extractor"]):
        return response(body, "Choose an available time in Bee Circles. Booking needs an explicit start and end time.",
                        "book_equipment", data=list_records(db, "equipment", user.org_id), tools=["book_equipment"])
    hive = authorized_hive(db, user, body.context_id)
    if hive:
        alerts = [row for row in list_records(db, "sensor_alert", user.org_id)
                  if row["hive_id"] == hive.id and row["status"] == "open"]
        return response(body, f"{hive.name}: {hive.status}. {len(alerts)} open sensor alerts. Sensor rules are screening only.",
                        "get_hive_status", data={"hive_id": hive.id, "status": hive.status, "alerts": alerts}, tools=["get_hive_status"])
    if body.context_id and db.get(Lot, body.context_id):
        lot = owned_lot(db, user, body.context_id, active=False)
        ancestors = sorted(ancestor_ids(db, lot.id))
        evidence = list(db.scalars(select(Evidence).where(Evidence.lot_id.in_(ancestors))))
        data = {"lot_id": lot.id, "code": lot.code, "available_g": lot.available_g,
                "status": safety_status(db, lot), "ancestor_ids": ancestors,
                "evidence": [{"id": item.id, "title": item.title, "expires_at": item.expires_at} for item in evidence]}
        return response(body, f"{lot.code}: {lot.available_g / 1000:g} kg available. Safety state: {data['status']}. "
                        f"{len(ancestors)} lots in this lineage; {len(evidence)} evidence records. Check expiry before use.",
                        "check_quantity", data=data, tools=["check_quantity", "get_batch_lineage", "get_lab_status", "check_recall"])
    return response(body, MESSAGES["welcome"], "help", tools=[])


def draft_action(db, user, body, action, payload):
    if action == "request_mentor" and payload.get("hive_id"):
        authorized_hive(db, user, payload["hive_id"])
    row = add_record(db, "madhu_confirmation", user, {"action": action, "payload": payload,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(), "used": False})
    return response(body, MESSAGES["draft"], action, requires_confirmation=True,
                    confirmation_id=row["id"], draft=payload, tools=[action])


def confirm_action(db, user, body):
    row = owned_record(db, body.confirmation_id, "madhu_confirmation", user, lock=True)
    if row.data["actor_id"] != user.id:
        raise HTTPException(403, "Only the actor who requested this draft can confirm it")
    if row.data["used"]:
        return response(body, MESSAGES["done"], row.data["action"], result=row.data["result"], replay=True)
    if datetime.fromisoformat(row.data["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(409, "Draft expired. Request a fresh draft.")
    action, payload = row.data["action"], row.data["payload"]
    if action in ("draft_harvest", "draft_inspection") and user.role not in ("beekeeper", "fpo", "admin"):
        raise HTTPException(403, "Your current role cannot confirm this action")
    if action == "draft_harvest":
        from .traceability import harvest
        lot = harvest(db, user, HarvestInput(**payload))
        result = {"lot_id": lot.id, "code": lot.code}
    elif action == "request_mentor":
        from .community import MentorRequest, request_mentor
        result = request_mentor(MentorRequest(**payload), db, user)
    elif action == "draft_inspection":
        hive = authorized_hive(db, user, payload["hive_id"])
        values = InspectionInput(observation=payload["observation"], status=payload["status"])
        hive.status = values.status
        result = add_record(db, "inspection", user, {"hive_id": hive.id, **values.model_dump()})
    else:
        raise HTTPException(422, "This operation is not in Madhu's allowlist")
    row.data = {**row.data, "used": True, "result": result}
    emit(db, user, "madhu.action.confirmed", row.id, {"action": action, "result": result})
    return response(body, MESSAGES["done"], action, result=result)


def authorized_hive(db, user, hive_id):
    hive = db.get(Hive, hive_id) if hive_id else None
    if hive and hive.org_id != user.org_id:
        raise HTTPException(403, "That hive is outside your authorized context")
    return hive


def response(body, answer, intent, **extra):
    localized, provider = translate(answer, body.language)
    return {"answer": localized, "language": body.language, "intent": intent, "source": SOURCE,
            "as_of": datetime.now(timezone.utc).isoformat(), "provider": "deterministic_cached_fallback",
            "translation_provider": provider, "requires_confirmation": False, **extra}


def has(text, keywords):
    return any(keyword in text for keyword in keywords)


def parse_grams(text):
    match = re.search(r"(?<![-\d.])(\d+(?:\.\d{1,3})?)\s*(kg|kilogram(?:me)?s?|g|grams?)\b", text)
    if not match:
        return None
    try:
        amount = Decimal(match[1]) * (1000 if match[2].startswith(("kg", "kilogram")) else 1)
        return int(amount) if amount == int(amount) and 0 < amount <= 10_000_000 else None
    except InvalidOperation:
        return None
