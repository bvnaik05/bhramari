from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class HiveInput(Input):
    name: str = Field(min_length=2, max_length=120)
    region: str = Field(min_length=2, max_length=120)
    floral: str = Field(default="Multiflora", max_length=120)


class InspectionInput(Input):
    observation: str = Field(min_length=3, max_length=3000)
    status: Literal["healthy", "attention", "urgent"]
    queen_seen: bool | None = None
    frames: int | None = Field(default=None, ge=0, le=100)


class HarvestInput(Input):
    hive_id: str = Field(max_length=64)
    product: Literal["honey", "beeswax"] = "honey"
    quantity_g: int = Field(gt=0, le=10_000_000, strict=True)
    floral: str = Field(default="Multiflora", max_length=120)
    notes: str = Field(default="", max_length=3000)


class Consumption(Input):
    lot_id: str = Field(max_length=64)
    quantity_g: int = Field(gt=0, le=100_000_000, strict=True)


class Output(Input):
    product: Literal["honey", "beeswax"]
    quantity_g: int = Field(gt=0, le=100_000_000, strict=True)


class OperationInput(Input):
    operation: Literal["split", "aggregate", "transform"]
    inputs: list[Consumption] = Field(min_length=1, max_length=50)
    outputs: list[Output] = Field(min_length=1, max_length=100)
    loss_g: int = Field(default=0, ge=0, le=100_000_000, strict=True)
    method: str = Field(min_length=3, max_length=250)


class CustodyInput(Input):
    lot_id: str = Field(max_length=64)
    to_org_id: str = Field(max_length=64)
    note: str = Field(default="", max_length=2000)


class CustodyDecision(Input):
    decision: Literal["accepted", "disputed"]
    note: str = Field(default="", max_length=2000)


class ShipmentInput(Input):
    lot_id: str = Field(max_length=64)
    custody_id: str = Field(max_length=64)
    destination: str = Field(min_length=3, max_length=250)
    carrier: str = Field(min_length=2, max_length=120)
    tracking_reference: str = Field(min_length=2, max_length=120)


class PackInput(Input):
    lot_id: str = Field(max_length=64)
    bottle_count: int = Field(gt=0, le=1000, strict=True)
    grams_per_bottle: int = Field(gt=0, le=5000, strict=True)


class RestrictionInput(Input):
    status: Literal["held", "recalled"]
    reason: str = Field(min_length=10, max_length=2000)


class ConsentInput(Input):
    purpose: Literal["public_producer_story", "assisted_capture", "research"]
    granted: bool
    expires_at: datetime

    @field_validator("expires_at")
    @classmethod
    def timezone_required(cls, value):
        if value.tzinfo is None:
            raise ValueError("Use a timezone-aware expiry")
        return value


class DeviceInput(Input):
    public_key: str = Field(min_length=40, max_length=60)
    name: str = Field(min_length=2, max_length=120)


class Envelope(Input):
    schema_version: Literal[1]
    event_id: str = Field(min_length=36, max_length=36)
    actor_id: str = Field(max_length=64)
    organisation_id: str = Field(max_length=64)
    event_type: Literal["harvest", "inspection"]
    subject_id: str = Field(max_length=64)
    occurred_at: str = Field(max_length=40)
    device_sequence: int = Field(gt=0, strict=True)
    previous_event_hash: str = Field(pattern=r"^([0-9a-f]{64})?$")
    payload_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    attachment_hashes: list[str] = Field(default_factory=list, max_length=20)
    key_id: str = Field(max_length=64)
    capture_mode: Literal["OFFLINE", "ONLINE"]
    payload: dict
    signature: str = Field(min_length=80, max_length=100)


class SyncInput(Input):
    events: list[Envelope] = Field(min_length=1, max_length=100)


class CorrectionInput(Input):
    reason: str = Field(min_length=10, max_length=1000)
    changes: dict[str, str | int | float | bool | None] = Field(min_length=1, max_length=30)

    @field_validator("changes")
    @classmethod
    def safe_changes(cls, value):
        blocked = {"password", "token", "secret", "private_key"}
        if any(len(key) > 80 or key.casefold() in blocked for key in value):
            raise ValueError("Correction fields are invalid or sensitive")
        if any(isinstance(item, str) and len(item) > 2000 for item in value.values()):
            raise ValueError("Correction values must be 2,000 characters or fewer")
        return value
