"""Seed demo company, roles, admin user, and sample workflow. Run: python -m scripts.seed"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.security import hash_password
from app.db.models import Company, Role, User, UserRole, WorkflowDefinition
from app.db.session import SessionLocal

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
    "settings": {"sla_hours": 48, "allow_delegate": False},
}


def _seed_workflow(db, company_id) -> None:
    existing = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.company_id == company_id,
            WorkflowDefinition.name == PETTY_CASH["name"],
        )
    )
    if existing:
        return
    db.add(
        WorkflowDefinition(
            company_id=company_id,
            name=PETTY_CASH["name"],
            form_schema=PETTY_CASH["form_schema"],
            steps=PETTY_CASH["steps"],
            routing_rules=PETTY_CASH["routing_rules"],
            settings=PETTY_CASH["settings"],
            status="draft",
        )
    )


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
            _seed_workflow(db, company.id)
            db.commit()
            print(f"Seed updated for existing company '{COMPANY_SLUG}'.")
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
        _seed_workflow(db, company.id)
        db.commit()
        print("Seed complete.")
        print(f"  Company: {COMPANY_NAME} ({COMPANY_SLUG})")
        print(f"  Admin:   {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        print(f"  Roles:   {', '.join(DEFAULT_ROLES)}")
        print(f"  Workflow: {PETTY_CASH['name']} (draft)")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
