from fastapi import HTTPException
from sqlalchemy import select

from .models import Lot, LotEdge


def assert_org(user, org_id):
    if user.org_id != org_id and user.role != "admin":
        raise HTTPException(403, "This record belongs to another organisation")


def ancestor_ids(db, lot_id):
    visited, pending = {lot_id}, [lot_id]
    while pending:
        parents = db.scalars(select(LotEdge.parent_id).where(LotEdge.child_id.in_(pending))).all()
        pending = [parent for parent in parents if parent not in visited]
        visited.update(pending)
    return visited


def descendant_ids(db, lot_id):
    visited, pending = {lot_id}, [lot_id]
    while pending:
        children = db.scalars(select(LotEdge.child_id).where(LotEdge.parent_id.in_(pending))).all()
        pending = [child for child in children if child not in visited]
        visited.update(pending)
    return visited


def safety_status(db, lot):
    states = set(db.scalars(select(Lot.status).where(Lot.id.in_(ancestor_ids(db, lot.id)))))
    return "recalled" if "recalled" in states else "held" if "held" in states else "active"


def owned_lot(db, user, lot_id, active=True):
    lot = db.scalar(select(Lot).where(Lot.id == lot_id).with_for_update())
    if not lot:
        raise HTTPException(404, "Lot not found")
    assert_org(user, lot.owner_org_id)
    if active and safety_status(db, lot) != "active":
        raise HTTPException(409, "A hold or recall prevents this operation")
    return lot
