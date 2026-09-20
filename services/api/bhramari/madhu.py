"""Role-aware operating assistant with deterministic, multilingual fallback."""

import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .access import ancestor_ids, owned_lot, safety_status
from .auth import current_user
from .community import add_record, list_records, owned_record
from .db import get_db
from .events import emit
from .models import Evidence, Hive, Lot, Record, User
from .schemas import HarvestInput, InspectionInput

router = APIRouter(prefix="/madhu", tags=["Madhu"])
SOURCE = {"title": "Bhramari field and traceability procedures", "version": "1.0",
          "reviewed_at": "2026-09-20", "url": "/docs/madhu-procedures", "scope": "Operational guidance; not veterinary or laboratory advice"}
MESSAGES = {
    "en": {"welcome": "I can check your hives, draft a harvest, check stock and evidence, or request a mentor. Select a hive or lot for context.",
           "safety": "This needs a qualified human. I cannot diagnose, prescribe treatment, certify purity, issue a recall, or make a credit decision. I can help you request a mentor.",
           "draft": "Please review this draft. Nothing is saved until you explicitly confirm.",
           "done": "Confirmed. Your request is saved with an audit record.",
           "context": "Select a hive or lot so I can use your authorized records.",
           "quantity": "Include a whole-gram quantity, for example: harvest 18 kg."},
    "hi": {"welcome": "मैं छत्ते की स्थिति, शहद की कटाई, उपलब्ध स्टॉक और प्रमाण देख सकती हूँ। छत्ता या लॉट चुनें।",
           "safety": "इसके लिए योग्य विशेषज्ञ की आवश्यकता है। मैं बीमारी का निदान, उपचार, शुद्धता प्रमाणन, रिकॉल या ऋण निर्णय नहीं कर सकती। आप मार्गदर्शक से सहायता माँग सकते हैं।",
           "draft": "इस मसौदे की जाँच करें। आपकी स्पष्ट पुष्टि के बाद ही रिकॉर्ड बनेगा।",
           "done": "पुष्टि हो गई। आपका अनुरोध ऑडिट रिकॉर्ड के साथ सुरक्षित है।",
           "context": "अपने अधिकृत रिकॉर्ड देखने के लिए छत्ता या लॉट चुनें।",
           "quantity": "मात्रा बताएँ, जैसे: कटाई 18 kg।"},
    "mr": {"welcome": "मी पोळ्याची स्थिती, मध काढणी, उपलब्ध साठा आणि पुरावे पाहू शकते. पोळे किंवा लॉट निवडा.",
           "safety": "यासाठी पात्र तज्ज्ञाची गरज आहे. मी रोगनिदान, औषधोपचार, शुद्धता प्रमाणपत्र, रिकॉल किंवा कर्ज निर्णय देऊ शकत नाही. मार्गदर्शकाची मदत मागू शकता.",
           "draft": "हा मसुदा तपासा. तुमच्या स्पष्ट पुष्टीनंतरच नोंद जतन होईल.",
           "done": "पुष्टी झाली. तुमची विनंती ऑडिट नोंदीसह जतन झाली आहे.",
           "context": "तुमच्या अधिकृत नोंदी पाहण्यासाठी पोळे किंवा लॉट निवडा.",
           "quantity": "प्रमाण सांगा, उदाहरणार्थ: काढणी 18 kg."},
}


class Chat(BaseModel):
    message: str = Field(default="", max_length=2000)
    language: Literal["en", "hi", "mr"] = "en"
    context_id: str | None = Field(default=None, max_length=64)
    confirmation_id: str | None = None


@router.post("/chat")
def chat(body: Chat, db: Session = Depends(get_db), user: User = Depends(current_user)):
    words = MESSAGES[body.language]
    if body.confirmation_id:
        return confirm_action(db, user, body, words)
    text = body.message.lower()
    if has(text, ["treatment", "medicine", "dose", "certify", "purity", "recall", "loan", "दवा", "उपचार", "औषध", "शुद्धता"]):
        return response(body, words["safety"], "escalation", escalation="qualified_human", tools=[])
    if has(text, ["mentor", "concern", "help hive", "मार्गदर्शक", "मदद", "मदत"]):
        return draft_action(db, user, body, "request_mentor", {"question": body.message, "hive_id": body.context_id})
    if has(text, ["harvest", "कटाई", "काढणी", "मध काढ"]):
        if user.role not in ("beekeeper", "fpo", "admin"):
            raise HTTPException(403, "Your role cannot capture a harvest")
        hive = authorized_hive(db, user, body.context_id)
        if not hive:
            return response(body, words["context"], "draft_harvest")
        grams = parse_grams(text)
        if not grams:
            return response(body, words["quantity"], "draft_harvest")
        payload = HarvestInput(hive_id=hive.id, quantity_g=grams, floral=hive.floral).model_dump()
        return draft_action(db, user, body, "draft_harvest", payload)
    if has(text, ["inspect", "inspection", "निरीक्षण", "तपासणी"]):
        if user.role not in ("beekeeper", "fpo", "admin"):
            raise HTTPException(403, "Your role cannot record an inspection")
        hive = authorized_hive(db, user, body.context_id)
        if not hive:
            return response(body, words["context"], "draft_inspection")
        return draft_action(db, user, body, "draft_inspection", {
            "hive_id": hive.id, "observation": body.message, "status": "attention"})
    return read_context(db, user, body)


def read_context(db, user, body):
    text = body.message.lower()
    if has(text, ["buyer", "demand", "खरीदार", "मागणी"]):
        rows = db.scalars(select(Record).where(Record.kind == "requirement")).all()
        data = [{"id": row.id, "product": row.data["product"], "quantity_g": row.data["quantity_g"]} for row in rows]
        return response(body, f"{len(data)} buyer requirements are available. Review evidence and availability before an enquiry.",
                        "find_buyer_demand", data=data, tools=["find_buyer_demand"])
    if has(text, ["equipment", "extractor", "उपकरण"]):
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
    return response(body, MESSAGES[body.language]["welcome"], "help", tools=[])


def draft_action(db, user, body, action, payload):
    if action == "request_mentor" and payload.get("hive_id"):
        authorized_hive(db, user, payload["hive_id"])
    row = add_record(db, "madhu_confirmation", user, {"action": action, "payload": payload,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(), "used": False})
    return response(body, MESSAGES[body.language]["draft"], action, requires_confirmation=True,
                    confirmation_id=row["id"], draft=payload, tools=[action])


def confirm_action(db, user, body, words):
    row = owned_record(db, body.confirmation_id, "madhu_confirmation", user, lock=True)
    if row.data["actor_id"] != user.id:
        raise HTTPException(403, "Only the actor who requested this draft can confirm it")
    if row.data["used"]:
        return response(body, words["done"], row.data["action"], result=row.data["result"], replay=True)
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
    return response(body, words["done"], action, result=result)


def authorized_hive(db, user, hive_id):
    hive = db.get(Hive, hive_id) if hive_id else None
    if hive and hive.org_id != user.org_id:
        raise HTTPException(403, "That hive is outside your authorized context")
    return hive


def response(body, answer, intent, **extra):
    return {"answer": answer, "language": body.language, "intent": intent, "source": SOURCE,
            "as_of": datetime.now(timezone.utc).isoformat(), "provider": "deterministic_cached_fallback",
            "requires_confirmation": False, **extra}


def has(text, keywords):
    return any(keyword in text for keyword in keywords)


def parse_grams(text):
    match = re.search(r"(?<![-\d.])(\d+(?:\.\d{1,3})?)\s*(kg|kilograms?|किलो|g|grams?|ग्राम)\b", text)
    if not match:
        return None
    try:
        amount = Decimal(match[1]) * (1000 if match[2] in ("kg", "kilogram", "kilograms", "किलो") else 1)
        return int(amount) if amount == int(amount) and 0 < amount <= 10_000_000 else None
    except InvalidOperation:
        return None
