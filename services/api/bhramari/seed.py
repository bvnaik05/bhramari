import base64
from datetime import timedelta

from sqlalchemy import select

from .events import emit
from .models import Bottle, Custody, Hive, Lot, LotEdge, Organisation, Record, User, now
from .passport import certificate
from .quality import EvidenceInput, add_evidence


def seed_demo(db):
    if db.get(User, "USER-BEEKEEPER"):
        return
    names = {"beekeeper": ("Sahyadri Beekeepers Collective", "Asha Patil"), "fpo": ("Sahyadri Honey FPO", "Meera Deshmukh"), "processor": ("Deccan Honey Works", "Rohan Shah"), "lab": ("Western Ghats Food Laboratory", "Dr. Kavita Rao"), "buyer": ("The Good Pantry", "Ananya Joshi"), "admin": ("Bhramari Cluster Coordination", "Cluster Coordinator")}
    for role, (organisation_name, name) in names.items():
        db.add(Organisation(id=f"ORG-{role.upper()}", name=organisation_name, kind=role))
    db.flush()
    for role, (_, name) in names.items():
        db.add(User(id=f"USER-{role.upper()}", email=f"{role}@bhramari.local", name=name, org_id=f"ORG-{role.upper()}", role=role))
    db.flush()
    beekeeper, fpo, lab = (db.get(User, f"USER-{role}") for role in ["BEEKEEPER", "FPO", "LAB"])
    for index, (name, floral, status) in enumerate([("Sahyadri · Hive 01", "Wildflower", "healthy"), ("Mango Grove · Hive 02", "Jamun", "healthy"), ("Riverbank · Hive 03", "Multiflora", "attention"), ("Forest Edge · Hive 04", "Wildflower", "healthy")], 1):
        hive = Hive(id=f"HIVE-MH-{index:03}", org_id=beekeeper.org_id, name=name, region="Satara, Maharashtra", floral=floral, status=status)
        db.add(hive)
        db.flush()
        emit(db, beekeeper, "hive.registered", hive.id, {"name": name, "region": hive.region, "simulation": True})
    honey = Lot(id="LOT-2026-001", code="BHR-HN-260901", product="honey", quantity_g=180000, available_g=140000, owner_org_id=beekeeper.org_id, source_hive_id="HIVE-MH-001", region="Satara, Maharashtra", floral="Wildflower", method="cold extraction")
    wax = Lot(id="LOT-WAX-001", code="BHR-WX-260901", product="beeswax", quantity_g=8000, available_g=5000, owner_org_id=beekeeper.org_id, source_hive_id="HIVE-MH-001", region="Satara, Maharashtra", floral="Wildflower", method="cappings collection")
    packed = Lot(id="LOT-2026-002", code="BHR-HN-260902", product="honey", quantity_g=40000, available_g=39500, owner_org_id=fpo.org_id, region="Satara, Maharashtra", floral="Wildflower", method="split for packing")
    clean_wax = Lot(id="LOT-WAX-002", code="BHR-WX-260902", product="beeswax", quantity_g=3000, available_g=3000, owner_org_id="ORG-PROCESSOR", region="Satara, Maharashtra", floral="Wildflower", method="filtered cappings wax")
    db.add_all([honey, wax, packed, clean_wax])
    db.flush()
    db.add_all([LotEdge(parent_id=honey.id, child_id=packed.id, quantity_g=40000, operation_id="DEMO-SPLIT-001"), LotEdge(parent_id=wax.id, child_id=clean_wax.id, quantity_g=3000, operation_id="DEMO-WAX-001")])
    for lot in [honey, wax]:
        emit(db, beekeeper, "lot.harvested", lot.id, {"hive_id": lot.source_hive_id, "product": lot.product, "quantity_g": lot.quantity_g, "simulation": True})
    emit(db, beekeeper, "lot.split", packed.id, {"parent_id": honey.id, "quantity_g": 40000, "simulation": True})
    emit(db, beekeeper, "lot.transform", clean_wax.id, {"parent_id": wax.id, "quantity_g": 3000, "loss_g": 0, "simulation": True})
    db.add(Custody(id="CUSTODY-DEMO-001", lot_id=packed.id, from_org_id=beekeeper.org_id, to_org_id=fpo.org_id, proposed_by=beekeeper.id, accepted_by=fpo.id, status="accepted", note="Simulated SIH cluster transfer"))
    emit(db, fpo, "custody.accepted", packed.id, {"custody_id": "CUSTODY-DEMO-001", "simulation": True})
    report = b'{"mode":"simulated laboratory fixture","test":"moisture screening","moisture_percent":17.8,"screening_only":true}'
    for lot_id in [honey.id, clean_wax.id]:
        add_evidence(EvidenceInput(lot_id=lot_id, kind="laboratory", title="Simulated laboratory screening report", content_base64=base64.b64encode(report).decode(), content_type="application/json", expires_at=(now() + timedelta(days=90)).date(), summary={"moisture_percent": 17.8, "screening_only": True}), lab, db)
    serial = "BHR-2026-0001"
    db.add(Bottle(serial=serial, lot_id=packed.id, quantity_g=500, certificate=certificate(serial, packed.id, 500)))
    emit(db, fpo, "lot.packaged", packed.id, {"bottle_serials": [serial], "quantity_g": 500, "simulation": True})
    db.add(Record(kind="demo_metadata", org_id="ORG-ADMIN", data={"mode": "simulated-validation", "notice": "All seeded people, organisations and laboratory results are demonstration fixtures."}))
    db.flush()
