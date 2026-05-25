"""Rich demo data: 12 workflows, org structure, and ~30 request transactions."""

from __future__ import annotations

import os
import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select

from app.core.security import hash_password
from app.db.models import (
    Branch,
    Company,
    Department,
    Notification,
    Role,
    User,
    UserRole,
    WorkflowDefinition,
    WorkflowEvent,
    WorkflowInstance,
)
from app.services import instance_engine
from app.services.notifications import notify_users
from app.services.ui_settings import suggest_ui_for_workflow_name

MANAGER_STEP = {
    "id": "step_manager",
    "name": "Manager Approval",
    "type": "approval",
    "assignee": {"type": "role", "value": "manager"},
}
FINANCE_STEP = {
    "id": "step_finance",
    "name": "Finance Approval",
    "type": "approval",
    "assignee": {"type": "role", "value": "company_admin"},
}

ORIGINATOR2_EMAIL = "originator2@demo.wizflow.biz"
SEED_PASSWORD = "changeme"

DEPARTMENTS = (
    ("Finance", "FIN"),
    ("Human Resources", "HR"),
    ("Information Technology", "IT"),
    ("Operations", "OPS"),
    ("Sales", "SAL"),
)

BRANCHES = (
    ("Head Office Nairobi", "NBO"),
    ("Mombasa Branch", "MBA"),
    ("Kisumu Branch", "KSM"),
)


def _two_step_fields(*field_defs: tuple) -> list:
    return [{"key": k, "type": t, "label": l, "required": True} for k, t, l in field_defs]


def _published_specs() -> list[dict]:
    """10 published workflow definitions."""
    amount_purpose = _two_step_fields(
        ("amount", "number", "Amount"),
        ("purpose", "text", "Purpose"),
        ("department", "text", "Department"),
    )
    return [
        {
            "name": "Petty Cash Approval",
            "form_schema": {"fields": amount_purpose},
            "routing_rules": [{"when": {"field": "amount", "op": "gt", "value": 5000}, "skip_to": "step_finance"}],
            "settings": {"sla_hours": 48},
        },
        {
            "name": "Purchase Request",
            "form_schema": {
                "fields": _two_step_fields(
                    ("amount", "number", "Total amount"),
                    ("item_description", "text", "Item / service"),
                    ("vendor", "text", "Vendor"),
                    ("department", "text", "Department"),
                )
            },
            "routing_rules": [{"when": {"field": "amount", "op": "gt", "value": 10000}, "skip_to": "step_finance"}],
            "settings": {"sla_hours": 72},
        },
        {
            "name": "Leave Approval",
            "form_schema": {
                "fields": [
                    {"key": "start_date", "type": "date", "label": "Start date", "required": True},
                    {"key": "end_date", "type": "date", "label": "End date", "required": True},
                    {"key": "leave_type", "type": "text", "label": "Leave type", "required": True},
                    {"key": "reason", "type": "textarea", "label": "Reason", "required": False},
                ]
            },
            "steps": [MANAGER_STEP],
            "routing_rules": [],
            "settings": {"sla_hours": 24},
        },
        {
            "name": "Travel Expense Claim",
            "form_schema": {"fields": amount_purpose + [{"key": "destination", "type": "text", "label": "Destination", "required": True}]},
            "routing_rules": [{"when": {"field": "amount", "op": "gt", "value": 8000}, "skip_to": "step_finance"}],
            "settings": {"sla_hours": 48},
        },
        {
            "name": "Overtime Request",
            "form_schema": {
                "fields": [
                    {"key": "hours", "type": "number", "label": "Overtime hours", "required": True},
                    {"key": "date", "type": "date", "label": "Date", "required": True},
                    {"key": "reason", "type": "text", "label": "Reason", "required": True},
                    {"key": "department", "type": "text", "label": "Department", "required": True},
                ]
            },
            "steps": [MANAGER_STEP],
            "routing_rules": [],
            "settings": {"sla_hours": 24},
        },
        {
            "name": "IT Access Request",
            "form_schema": {
                "fields": [
                    {"key": "system_name", "type": "text", "label": "System", "required": True},
                    {"key": "access_level", "type": "text", "label": "Access level", "required": True},
                    {"key": "justification", "type": "textarea", "label": "Justification", "required": True},
                    {"key": "department", "type": "text", "label": "Department", "required": True},
                ]
            },
            "steps": [MANAGER_STEP, FINANCE_STEP],
            "routing_rules": [],
            "settings": {"sla_hours": 48},
        },
        {
            "name": "Vendor Onboarding",
            "form_schema": {
                "fields": _two_step_fields(
                    ("vendor_name", "text", "Vendor name"),
                    ("amount", "number", "Estimated annual spend"),
                    ("category", "text", "Category"),
                    ("department", "text", "Department"),
                )
            },
            "routing_rules": [{"when": {"field": "amount", "op": "gt", "value": 50000}, "skip_to": "step_finance"}],
            "settings": {"sla_hours": 96},
        },
        {
            "name": "Contract Review",
            "form_schema": {
                "fields": _two_step_fields(
                    ("contract_title", "text", "Contract title"),
                    ("amount", "number", "Contract value"),
                    ("counterparty", "text", "Counterparty"),
                    ("department", "text", "Department"),
                )
            },
            "routing_rules": [{"when": {"field": "amount", "op": "gt", "value": 25000}, "skip_to": "step_finance"}],
            "settings": {"sla_hours": 120},
        },
        {
            "name": "Training Request",
            "form_schema": {
                "fields": [
                    {"key": "course_name", "type": "text", "label": "Course", "required": True},
                    {"key": "amount", "type": "number", "label": "Cost", "required": True},
                    {"key": "department", "type": "text", "label": "Department", "required": True},
                ]
            },
            "routing_rules": [{"when": {"field": "amount", "op": "gt", "value": 3000}, "skip_to": "step_finance"}],
            "settings": {"sla_hours": 48},
        },
        {
            "name": "Equipment Request",
            "form_schema": {
                "fields": _two_step_fields(
                    ("item", "text", "Equipment item"),
                    ("amount", "number", "Estimated cost"),
                    ("department", "text", "Department"),
                )
            },
            "routing_rules": [{"when": {"field": "amount", "op": "gt", "value": 15000}, "skip_to": "step_finance"}],
            "settings": {"sla_hours": 72},
        },
    ]


def _draft_specs() -> list[dict]:
    return [
        {
            "name": "Office Supplies (Draft)",
            "form_schema": {"fields": _two_step_fields(("amount", "number", "Amount"), ("purpose", "text", "Purpose"))},
            "status": "draft",
        },
        {
            "name": "Facilities Maintenance (Draft)",
            "form_schema": {
                "fields": [
                    {"key": "location", "type": "text", "label": "Location", "required": True},
                    {"key": "issue", "type": "textarea", "label": "Issue description", "required": True},
                ]
            },
            "steps": [MANAGER_STEP],
            "status": "draft",
        },
    ]


def _normalize_spec(spec: dict) -> dict:
    spec = dict(spec)
    if "steps" not in spec:
        spec["steps"] = [MANAGER_STEP, FINANCE_STEP]
    spec.setdefault("routing_rules", [])
    spec.setdefault("settings", {"sla_hours": 48})
    spec.setdefault("status", "published")
    spec = dict(spec)
    settings = dict(spec.get("settings") or {})
    ui = suggest_ui_for_workflow_name(spec["name"])
    settings.setdefault("ui_theme", ui["ui_theme"])
    settings.setdefault("form_layout", ui["form_layout"])
    spec["settings"] = settings
    return spec


ALL_SPECS = [_normalize_spec(s) for s in _published_specs()] + [_normalize_spec(s) for s in _draft_specs()]


def _upsert_workflow(db, company_id: uuid.UUID, spec: dict) -> WorkflowDefinition:
    existing = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.company_id == company_id,
            WorkflowDefinition.name == spec["name"],
            WorkflowDefinition.status == spec["status"],
        )
    )
    if existing:
        ui = suggest_ui_for_workflow_name(spec["name"])
        settings = dict(existing.settings or {})
        settings.setdefault("ui_theme", ui["ui_theme"])
        settings.setdefault("form_layout", ui["form_layout"])
        existing.settings = settings
        return existing
    fid = uuid.uuid4()
    defn = WorkflowDefinition(
        id=fid,
        company_id=company_id,
        family_id=fid,
        name=spec["name"],
        form_schema=spec["form_schema"],
        steps=spec["steps"],
        routing_rules=spec.get("routing_rules", []),
        settings=spec.get("settings", {}),
        status=spec["status"],
        version=1,
    )
    db.add(defn)
    db.flush()
    return defn


def _seed_org(db, company_id: uuid.UUID) -> None:
    for name, code in DEPARTMENTS:
        if not db.scalar(
            select(Department).where(Department.company_id == company_id, Department.name == name)
        ):
            db.add(Department(company_id=company_id, name=name, code=code))
    for name, code in BRANCHES:
        if not db.scalar(select(Branch).where(Branch.company_id == company_id, Branch.name == name)):
            db.add(Branch(company_id=company_id, name=name, code=code))


def _seed_extra_user(db, company_id: uuid.UUID, role_map: dict[str, Role]) -> User:
    user = db.scalar(select(User).where(User.email == ORIGINATOR2_EMAIL))
    if user:
        return user
    user = User(
        company_id=company_id,
        email=ORIGINATOR2_EMAIL,
        password_hash=hash_password(SEED_PASSWORD),
        full_name="Alex Originator",
    )
    db.add(user)
    db.flush()
    if "originator" in role_map:
        db.add(UserRole(user_id=user.id, role_id=role_map["originator"].id))
    return user


def sample_data(defn: WorkflowDefinition, *, low_amount: bool = False) -> dict:
    fields = (defn.form_schema or {}).get("fields") or []
    dept = random.choice(["Finance", "IT", "HR", "Operations", "Sales"])
    data: dict = {}
    for field in fields:
        if not isinstance(field, dict):
            continue
        key = field.get("key", "")
        ftype = field.get("type", "text")
        if key == "amount":
            if low_amount:
                data[key] = random.randint(120, 4800)
            else:
                data[key] = random.randint(800, 98500)
        elif key in ("project_name", "contract_title"):
            data[key] = f"{random.choice(['Alpha', 'Beta', 'Gamma', 'Delta'])} {random.randint(10, 99)}"
        elif key == "business_case":
            data[key] = random.choice(
                [
                    "Expand regional capacity for Q3.",
                    "Replace legacy tooling before audit.",
                    "Reduce operating cost via automation.",
                ]
            )
        elif key == "hours":
            data[key] = random.randint(2, 12)
        elif "date" in key or ftype == "date":
            data[key] = "2026-05-15"
        elif key == "department":
            data[key] = dept
        elif key in ("purpose", "reason", "justification", "issue"):
            data[key] = f"Demo {key} for {defn.name}"
        elif key == "leave_type":
            data[key] = random.choice(["Annual", "Sick", "Unpaid"])
        elif key == "vendor" or key == "vendor_name":
            data[key] = random.choice(["Safaricom Supplies", "Office Mart", "TechWorld Ltd"])
        elif key == "item" or key == "item_description":
            data[key] = random.choice(["Laptop", "Printer cartridges", "Conference tickets"])
        elif key == "destination":
            data[key] = random.choice(["Mombasa", "Kisumu", "Nairobi"])
        elif key == "system_name":
            data[key] = "ERP Finance Module"
        elif key == "access_level":
            data[key] = "Read/Write"
        elif key == "course_name":
            data[key] = "Project Management Fundamentals"
        elif key == "contract_title":
            data[key] = "Annual maintenance agreement"
        elif key == "counterparty":
            data[key] = "Acme Services Ltd"
        elif key == "category":
            data[key] = "Professional services"
        elif key == "location":
            data[key] = "Floor 3 — West wing"
        else:
            data[key] = f"Sample {key}"
    return data


def _clear_transactions(db, company_id: uuid.UUID) -> None:
    inst_ids = list(
        db.scalars(select(WorkflowInstance.id).where(WorkflowInstance.company_id == company_id))
    )
    if not inst_ids:
        return
    db.execute(delete(WorkflowEvent).where(WorkflowEvent.instance_id.in_(inst_ids)))
    db.execute(delete(Notification).where(Notification.instance_id.in_(inst_ids)))
    db.execute(delete(WorkflowInstance).where(WorkflowInstance.company_id == company_id))


def _notify_inbox(db, inst: WorkflowInstance) -> None:
    ids = [uuid.UUID(a["user_id"]) for a in inst.assignees if a.get("user_id")]
    if ids:
        notify_users(
            db,
            company_id=inst.company_id,
            user_ids=ids,
            title=f"Approval needed: {inst.workflow_name}",
            body="Demo seed — please review.",
            instance_id=inst.id,
            send_email=False,
        )


def _submit(
    db,
    defn: WorkflowDefinition,
    originator_id: uuid.UUID,
    company_id: uuid.UUID,
    *,
    low_amount: bool = False,
) -> WorkflowInstance:
    inst = instance_engine.submit_request(
        db,
        defn=defn,
        user_id=originator_id,
        company_id=company_id,
        data=sample_data(defn, low_amount=low_amount),
    )
    _notify_inbox(db, inst)
    return inst


def _approve_all(db, inst: WorkflowInstance, defn: WorkflowDefinition, approver_id: uuid.UUID) -> None:
    while inst.status == "in_progress":
        instance_engine.approve_request(db, inst, defn, approver_id, "Approved (demo seed)")
        if inst.status == "in_progress" and inst.assignees:
            _notify_inbox(db, inst)


def _seed_transactions(
    db,
    company_id: uuid.UUID,
    published: list[WorkflowDefinition],
    originator: User,
    originator2: User,
    admin: User,
) -> dict[str, int]:
    stats = {"approved": 0, "in_progress": 0, "rejected": 0, "returned": 0, "pending_step2": 0}
    random.shuffle(published)
    approver = admin.id

    # ~10 fully approved
    for defn in published[:10]:
        who = originator if stats["approved"] % 2 == 0 else originator2
        inst = _submit(db, defn, who.id, company_id, low_amount=(stats["approved"] % 3 == 0))
        _approve_all(db, inst, defn, approver)
        stats["approved"] += 1

    # ~6 waiting in inbox (manager step)
    for defn in published[3:9]:
        inst = _submit(db, defn, originator.id, company_id, low_amount=True)
        stats["in_progress"] += 1

    # ~3 at finance step (high amount)
    for defn in published[:3]:
        inst = _submit(db, defn, originator2.id, company_id, low_amount=False)
        instance_engine.approve_request(db, inst, defn, approver, "Manager OK")
        if inst.status == "in_progress":
            _notify_inbox(db, inst)
            stats["pending_step2"] += 1

    # ~4 rejected
    for defn in published[5:9]:
        inst = _submit(db, defn, originator.id, company_id)
        instance_engine.reject_request(db, inst, approver, "Not within budget (demo)")
        stats["rejected"] += 1

    # ~3 returned
    for defn in published[2:5]:
        inst = _submit(db, defn, originator2.id, company_id)
        instance_engine.return_request(db, inst, approver, "Please add more detail (demo)")
        stats["returned"] += 1

    return stats


def seed_rich_demo(db, company: Company, admin: User, originator: User, role_map: dict[str, Role]) -> None:
    force = os.environ.get("SEED_FORCE", "").strip() in ("1", "true", "yes")
    inst_count = db.scalar(
        select(func.count()).select_from(WorkflowInstance).where(WorkflowInstance.company_id == company.id)
    ) or 0

    _seed_org(db, company.id)
    originator2 = _seed_extra_user(db, company.id, role_map)

    workflows = [_upsert_workflow(db, company.id, spec) for spec in ALL_SPECS]
    published = [w for w in workflows if w.status == "published"]

    if inst_count >= 20 and not force:
        print(f"  Rich seed: skipped transactions ({inst_count} instances exist). Set SEED_FORCE=1 to rebuild.")
        db.flush()
        return

    if force or inst_count > 0:
        _clear_transactions(db, company.id)
        print("  Rich seed: cleared existing demo transactions.")

    stats = _seed_transactions(db, company.id, published, originator, originator2, admin)

    total = db.scalar(
        select(func.count()).select_from(WorkflowInstance).where(WorkflowInstance.company_id == company.id)
    )
    print(f"  Rich seed: {len(workflows)} workflows ({len(published)} published, {len(workflows) - len(published)} draft)")
    print(f"  Rich seed: {total} requests — approved={stats['approved']}, inbox={stats['in_progress'] + stats['pending_step2']}, rejected={stats['rejected']}, returned={stats['returned']}")
    print(f"  Extra user: {ORIGINATOR2_EMAIL} / {SEED_PASSWORD}")
