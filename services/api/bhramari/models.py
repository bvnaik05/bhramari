from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def uid():
    return str(uuid4())


def now():
    return datetime.now(timezone.utc)


class Organisation(Base):
    __tablename__ = "organisations"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    name: Mapped[str]
    kind: Mapped[str]


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(unique=True)
    name: Mapped[str]
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"))
    role: Mapped[str]
    oidc_subject: Mapped[str | None] = mapped_column(unique=True)
    active: Mapped[bool] = mapped_column(default=True)


class Hive(Base):
    __tablename__ = "hives"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True)
    name: Mapped[str]
    region: Mapped[str]
    floral: Mapped[str] = mapped_column(default="Multiflora")
    status: Mapped[str] = mapped_column(default="healthy")
    created_at: Mapped[datetime] = mapped_column(default=now)


class Lot(Base):
    __tablename__ = "lots"
    __table_args__ = (CheckConstraint("quantity_g > 0 AND available_g >= 0 AND available_g <= quantity_g"),)
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    code: Mapped[str] = mapped_column(unique=True)
    product: Mapped[str]
    quantity_g: Mapped[int]
    available_g: Mapped[int]
    owner_org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True)
    source_hive_id: Mapped[str | None] = mapped_column(ForeignKey("hives.id"))
    status: Mapped[str] = mapped_column(default="active")
    region: Mapped[str]
    floral: Mapped[str]
    method: Mapped[str] = mapped_column(default="harvest")
    created_at: Mapped[datetime] = mapped_column(default=now)


class LotEdge(Base):
    __tablename__ = "lot_edges"
    __table_args__ = (UniqueConstraint("parent_id", "child_id"),)
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    parent_id: Mapped[str] = mapped_column(ForeignKey("lots.id"), index=True)
    child_id: Mapped[str] = mapped_column(ForeignKey("lots.id"), index=True)
    quantity_g: Mapped[int]
    operation_id: Mapped[str]


class Device(Base):
    __tablename__ = "devices"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    public_key: Mapped[str]
    name: Mapped[str]
    sequence: Mapped[int] = mapped_column(default=0)
    last_hash: Mapped[str] = mapped_column(default="")
    revoked: Mapped[bool] = mapped_column(default=False)


class DomainEvent(Base):
    __tablename__ = "domain_events"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    org_id: Mapped[str] = mapped_column(index=True)
    subject_id: Mapped[str] = mapped_column(index=True)
    event_type: Mapped[str]
    payload: Mapped[dict] = mapped_column(JSON)
    hash: Mapped[str] = mapped_column(unique=True)
    created_at: Mapped[datetime] = mapped_column(default=now)
    checkpoint_id: Mapped[str | None] = mapped_column(index=True)


class SyncReceipt(Base):
    __tablename__ = "sync_receipts"
    id: Mapped[str] = mapped_column(primary_key=True)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"))
    envelope_hash: Mapped[str]
    status: Mapped[str]
    result: Mapped[dict] = mapped_column(JSON)


class Evidence(Base):
    __tablename__ = "evidence"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    lot_id: Mapped[str] = mapped_column(ForeignKey("lots.id"), index=True)
    issuer_org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"))
    kind: Mapped[str]
    title: Mapped[str]
    sha256: Mapped[str]
    content_type: Mapped[str]
    object_path: Mapped[str]
    expires_at: Mapped[str]
    summary: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(default=now)


class Custody(Base):
    __tablename__ = "custody"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    lot_id: Mapped[str] = mapped_column(ForeignKey("lots.id"))
    from_org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"))
    to_org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"))
    proposed_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    accepted_by: Mapped[str | None]
    status: Mapped[str] = mapped_column(default="proposed")
    note: Mapped[str] = mapped_column(default="")
    created_at: Mapped[datetime] = mapped_column(default=now)


class Bottle(Base):
    __tablename__ = "bottles"
    serial: Mapped[str] = mapped_column(primary_key=True)
    lot_id: Mapped[str] = mapped_column(ForeignKey("lots.id"), index=True)
    quantity_g: Mapped[int]
    certificate: Mapped[str]
    active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=now)


class Checkpoint(Base):
    __tablename__ = "checkpoints"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    root: Mapped[str]
    event_ids: Mapped[list] = mapped_column(JSON)
    leaves: Mapped[list] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(default="pending")
    receipt: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=now)


class Record(Base):
    __tablename__ = "records"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    kind: Mapped[str] = mapped_column(index=True)
    org_id: Mapped[str] = mapped_column(index=True)
    data: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(default=now)
