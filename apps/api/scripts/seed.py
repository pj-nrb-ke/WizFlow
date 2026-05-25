"""Seed demo company, roles, users, 12 workflows, and rich transactional data.

Run: python -m scripts.seed
Force rebuild requests: SEED_FORCE=1 python -m scripts.seed
"""

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.security import hash_password
from app.db.models import Company, Role, User, UserRole, WorkflowDefinition
from app.db.session import SessionLocal
from scripts.seed_rich import seed_rich_demo

DEFAULT_ROLES = ("company_admin", "manager", "originator", "approver")
ROLE_COMPANY_ADMIN = "company_admin"
ROLE_MANAGER = "manager"

ADMIN_EMAIL = "admin@demo.wizflow.biz"
ADMIN_PASSWORD = "changeme"
COMPANY_SLUG = "demo-co"
COMPANY_NAME = "Demo Company"

PETTY_CASH = {
    "name": "Petty Cash Approval",
    "form_schema": {
        "fields": [
            {"key": "amount", "type": "number", "label": "Amount", "required": True},
            {"key": "purpose", "type": "text", "label": "Purpose", "required": True},
            {"key": "department", "type": "dropdown", "label": "Department", "required": True, "options": []},
        ]
    },
    "steps": [
        {
            "id": "step_manager",
            "name": "Manager Approval",
            "type": "approval",
            "assignee": {"type": "role", "value": "manager"},
        },
        {
            "id": "step_finance",
            "name": "Finance Approval",
            "type": "approval",
            "assignee": {"type": "role", "value": "company_admin"},
        },
    ],
    "routing_rules": [
        {"when": {"field": "amount", "op": "gt", "value": 5000}, "skip_to": "step_finance"}
    ],
    "settings": {"sla_hours": 48, "allow_delegate": False, "serial_prefix": "PC"},
}

PURCHASE_REQUEST = {
    "name": "Purchase Request",
    "form_schema": {
        "fields": [
            {"key": "amount", "type": "number", "label": "Total amount", "required": True},
            {"key": "item_description", "type": "text", "label": "Item / service", "required": True},
            {"key": "vendor", "type": "text", "label": "Vendor", "required": True},
            {"key": "department", "type": "text", "label": "Department", "required": True},
        ]
    },
    "steps": [
        {
            "id": "step_manager",
            "name": "Manager Approval",
            "type": "approval",
            "assignee": {"type": "role", "value": "manager"},
        },
        {
            "id": "step_finance",
            "name": "Finance Approval",
            "type": "approval",
            "assignee": {"type": "role", "value": "company_admin"},
        },
    ],
    "routing_rules": [
        {"when": {"field": "amount", "op": "gt", "value": 10000}, "skip_to": "step_finance"}
    ],
    "settings": {"sla_hours": 72, "allow_delegate": False, "serial_prefix": "PR"},
}

FEE_NOTE_NAME = "Fee Note Approval"
ACC1_EMAIL = "acc1@demo.wizflow.biz"
ACC2_EMAIL = "acc2@demo.wizflow.biz"

DEMO_WORKFLOWS = (PETTY_CASH, PURCHASE_REQUEST)


def _ensure_accountants(db, company_id, role_map: dict) -> list:
    """Two accountant users for named-user / claim demos."""
    ids: list = []
    for email, name in ((ACC1_EMAIL, "Demo Accountant 1"), (ACC2_EMAIL, "Demo Accountant 2")):
        u = db.scalar(select(User).where(User.email == email))
        if not u:
            u = User(
                company_id=company_id,
                email=email,
                password_hash=hash_password(ADMIN_PASSWORD),
                full_name=name,
            )
            db.add(u)
            db.flush()
        if "approver" in role_map:
            exists = db.scalar(
                select(UserRole).where(
                    UserRole.user_id == u.id,
                    UserRole.role_id == role_map["approver"].id,
                )
            )
            if not exists:
                db.add(UserRole(user_id=u.id, role_id=role_map["approver"].id))
        ids.append(str(u.id))
    return ids


def _seed_fee_note_workflow(db, company_id, accountant_ids: list[str]) -> None:
    if db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.company_id == company_id,
            WorkflowDefinition.name == FEE_NOTE_NAME,
            WorkflowDefinition.status == "published",
        )
    ):
        return
    fid = uuid.uuid4()
    spec = {
        "name": FEE_NOTE_NAME,
        "form_schema": {
            "fields": [
                {"key": "client_name", "type": "text", "label": "Client", "required": True},
                {"key": "amount", "type": "number", "label": "Fee amount", "required": True},
                {"key": "notes", "type": "text", "label": "Notes", "required": False},
            ]
        },
        "steps": [
            {
                "id": "step_admin",
                "name": "Admin Approval",
                "type": "approval",
                "assignee": {"type": "role", "value": "company_admin"},
            },
            {
                "id": "step_accountant",
                "name": "Accountant Approval",
                "type": "approval",
                "assignee": {
                    "type": "users",
                    "user_ids": accountant_ids,
                    "mode": "claim",
                },
            },
        ],
        "routing_rules": [],
        "settings": {"sla_hours": 48, "serial_prefix": "FN"},
    }
    defn = WorkflowDefinition(
        id=fid,
        company_id=company_id,
        family_id=fid,
        name=spec["name"],
        form_schema=spec["form_schema"],
        steps=spec["steps"],
        routing_rules=spec["routing_rules"],
        settings=spec["settings"],
        status="published",
        version=1,
    )
    db.add(defn)


def _add_published_workflow(db, company_id, spec: dict) -> None:
    existing = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.company_id == company_id,
            WorkflowDefinition.name == spec["name"],
            WorkflowDefinition.status == "published",
        )
    )
    if existing:
        return
    fid = uuid.uuid4()
    defn = WorkflowDefinition(
        id=fid,
        company_id=company_id,
        family_id=fid,
        name=spec["name"],
        form_schema=spec["form_schema"],
        steps=spec["steps"],
        routing_rules=spec["routing_rules"],
        settings=spec["settings"],
        status="published",
        version=1,
    )
    db.add(defn)


def _seed_workflows(db, company_id, role_map: dict | None = None) -> None:
    for spec in DEMO_WORKFLOWS:
        _add_published_workflow(db, company_id, spec)
    if role_map:
        acc_ids = _ensure_accountants(db, company_id, role_map)
        _seed_fee_note_workflow(db, company_id, acc_ids)
    # Ensure legacy petty cash row is published
    legacy = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.company_id == company_id,
            WorkflowDefinition.name == PETTY_CASH["name"],
        )
    )
    if legacy and legacy.status == "draft":
        legacy.status = "published"
        if not legacy.family_id:
            legacy.family_id = legacy.id


ORIGINATOR_EMAIL = "originator@demo.wizflow.biz"


def _seed_originator(db, company_id, role_map: dict) -> None:
    if db.scalar(select(User).where(User.email == ORIGINATOR_EMAIL)):
        return
    user = User(
        company_id=company_id,
        email=ORIGINATOR_EMAIL,
        password_hash=hash_password(ADMIN_PASSWORD),
        full_name="Demo Originator",
    )
    db.add(user)
    db.flush()
    if "originator" in role_map:
        db.add(UserRole(user_id=user.id, role_id=role_map["originator"].id))


def seed() -> None:
    db = SessionLocal()
    try:
        company = db.scalar(select(Company).where(Company.slug == COMPANY_SLUG))
        if company:
            admin = db.scalar(select(User).where(User.email == ADMIN_EMAIL))
            if admin:
                roles = db.scalars(select(Role).where(Role.company_id == company.id)).all()
                role_map = {r.slug: r for r in roles}
                for slug in (ROLE_COMPANY_ADMIN, ROLE_MANAGER):
                    if slug in role_map:
                        exists = db.scalar(
                            select(UserRole).where(
                                UserRole.user_id == admin.id,
                                UserRole.role_id == role_map[slug].id,
                            )
                        )
                        if not exists:
                            db.add(UserRole(user_id=admin.id, role_id=role_map[slug].id))
            roles = db.scalars(select(Role).where(Role.company_id == company.id)).all()
            role_map = {r.slug: r for r in roles}
            _seed_originator(db, company.id, role_map)
            _seed_workflows(db, company.id, role_map)
            admin = db.scalar(select(User).where(User.email == ADMIN_EMAIL))
            originator = db.scalar(select(User).where(User.email == ORIGINATOR_EMAIL))
            if admin and originator:
                seed_rich_demo(db, company, admin, originator, role_map)
            db.commit()
            print(f"Seed updated for existing company '{COMPANY_SLUG}'.")
            print(f"  Originator: {ORIGINATOR_EMAIL} / {ADMIN_PASSWORD}")
            return

        company = Company(name=COMPANY_NAME, slug=COMPANY_SLUG)
        db.add(company)
        db.flush()

        role_by_slug: dict[str, Role] = {}
        for slug in DEFAULT_ROLES:
            role = Role(company_id=company.id, slug=slug, name=slug.replace("_", " ").title())
            db.add(role)
            role_by_slug[slug] = role
        db.flush()

        admin = User(
            company_id=company.id,
            email=ADMIN_EMAIL,
            password_hash=hash_password(ADMIN_PASSWORD),
            full_name="Demo Admin",
        )
        db.add(admin)
        db.flush()

        db.add(UserRole(user_id=admin.id, role_id=role_by_slug[ROLE_COMPANY_ADMIN].id))
        db.add(UserRole(user_id=admin.id, role_id=role_by_slug[ROLE_MANAGER].id))
        _seed_originator(db, company.id, role_by_slug)
        db.flush()
        _seed_workflows(db, company.id, role_by_slug)
        originator = db.scalar(select(User).where(User.email == ORIGINATOR_EMAIL))
        if originator:
            seed_rich_demo(db, company, admin, originator, role_by_slug)
        db.commit()
        print("Seed complete.")
        print(f"  Company: {COMPANY_NAME} ({COMPANY_SLUG})")
        print(f"  Admin:     {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        print(f"  Originator: {ORIGINATOR_EMAIL} / {ADMIN_PASSWORD}")
        print(f"  Workflows: {', '.join(w['name'] for w in DEMO_WORKFLOWS)} (published)")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
