"""Bee Circle support and shared equipment, scoped to each organization."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import current_user, require_roles
from .db import get_db
from .events import emit
from .models import Record, User

router = APIRouter(prefix="/circles", tags=["Bee Circles"])


class Question(BaseModel):
    circle_id: str = "sahyadri"
    question: str = Field(min_length=8, max_length=2000)


class MentorRequest(BaseModel):
    hive_id: str | None = None
    question: str = Field(min_length=8, max_length=2000)


class BookingRequest(BaseModel):
    equipment_id: str
    starts_at: datetime
    ends_at: datetime

    @field_validator("starts_at", "ends_at")
    @classmethod
    def require_timezone(cls, value):
        if value.tzinfo is None:
            raise ValueError("Include a timezone in the booking time")
        return value.astimezone(timezone.utc)


class Resolution(BaseModel):
    response: str = Field(min_length=8, max_length=2000)


@router.get("")
def circles(user: User = Depends(current_user)):
    return [{"id": "sahyadri", "name": "Sahyadri Bee Circle", "region": "Maharashtra",
             "description": "Harvest support, shared equipment and accountable market access.",
             "org_id": user.org_id}]


@router.get("/questions")
def questions(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return list_records(db, "question", user.org_id)


@router.post("/questions", status_code=201)
def ask_question(body: Question, db: Session = Depends(get_db),
                 user: User = Depends(current_user)):
    return add_record(db, "question", user, {**body.model_dump(), "status": "pending_moderation"})


@router.get("/mentors")
def mentors(user: User = Depends(current_user)):
    return [{"id": "mentor-desk", "name": "Cluster mentor desk",
             "specialty": "Hive management and harvest practices", "availability": "Request a callback",
             "verification": "Demo desk; confirm a qualified mentor before a real consultation"}]


@router.get("/mentor-requests")
def mentor_requests(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return list_records(db, "mentor_request", user.org_id)


@router.post("/mentor-requests", status_code=201)
def request_mentor(body: MentorRequest, db: Session = Depends(get_db),
                   user: User = Depends(current_user)):
    if body.hive_id:
        from .models import Hive
        hive = db.get(Hive, body.hive_id)
        if not hive or hive.org_id != user.org_id:
            raise HTTPException(404, "Hive not found in your organization")
    return add_record(db, "mentor_request", user, {**body.model_dump(), "status": "requested"})


@router.post("/mentor-requests/{request_id}/resolve")
def resolve_request(request_id: str, body: Resolution, db: Session = Depends(get_db),
                    user: User = Depends(require_roles("fpo", "admin"))):
    record = owned_record(db, request_id, "mentor_request", user)
    record.data = {**record.data, "response": body.response, "resolved_by": user.id, "status": "resolved"}
    return record_view(record)


@router.get("/equipment")
def equipment(db: Session = Depends(get_db), user: User = Depends(current_user)):
    records = list_records(db, "equipment", user.org_id)
    if not records:
        records = [add_record(db, "equipment", user, {
            "name": "Four-frame honey extractor", "description": "Food-contact steel · clean before and after use",
            "location": "Cluster collection center", "daily_fee_minor": 15000,
        })]
    return records


@router.get("/bookings")
def bookings(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return list_records(db, "booking", user.org_id)


@router.post("/bookings", status_code=201)
def book_equipment(body: BookingRequest, db: Session = Depends(get_db),
                   user: User = Depends(current_user)):
    owned_record(db, body.equipment_id, "equipment", user, lock=True)
    if body.ends_at <= body.starts_at:
        raise HTTPException(422, "Booking end must follow its start")
    if body.starts_at < datetime.now(timezone.utc):
        raise HTTPException(422, "Booking must start in the future")
    for booking in list_records(db, "booking", user.org_id):
        if booking["equipment_id"] != body.equipment_id or booking["status"] == "cancelled":
            continue
        start = datetime.fromisoformat(booking["starts_at"])
        end = datetime.fromisoformat(booking["ends_at"])
        if body.starts_at < end and body.ends_at > start:
            raise HTTPException(409, "Equipment is already booked for this time")
    return add_record(db, "booking", user, {**body.model_dump(mode="json"), "status": "confirmed"})


@router.delete("/bookings/{booking_id}")
def cancel_booking(booking_id: str, db: Session = Depends(get_db),
                   user: User = Depends(current_user)):
    record = owned_record(db, booking_id, "booking", user)
    if record.data["actor_id"] != user.id and user.role not in ("fpo", "admin"):
        raise HTTPException(403, "Only the booking owner or coordinator can cancel")
    record.data = {**record.data, "status": "cancelled"}
    return record_view(record)


def add_record(db, kind, user, data):
    record = Record(kind=kind, org_id=user.org_id, data={**data, "actor_id": user.id})
    db.add(record)
    db.flush()
    if kind not in ("sensor_reading", "equipment", "madhu_confirmation"):
        emit(db, user, f"{kind}.created", record.id, data)
    return record_view(record)


def list_records(db, kind, org_id):
    return [record_view(row) for row in db.scalars(select(Record).where(
        Record.kind == kind, Record.org_id == org_id).order_by(Record.created_at.desc()))]


def owned_record(db, record_id, kind, user, lock=False):
    query = select(Record).where(Record.id == record_id, Record.kind == kind,
                                Record.org_id == user.org_id)
    if lock:
        query = query.with_for_update()
    record = db.scalar(query)
    if not record:
        raise HTTPException(404, "Record not found in your organization")
    return record


def record_view(record):
    return {**record.data, "id": record.id, "org_id": record.org_id,
            "created_at": record.created_at.isoformat() if record.created_at else None}
