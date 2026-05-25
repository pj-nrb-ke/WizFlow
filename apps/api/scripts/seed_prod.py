"""Minimal production seed: company, roles, admin, published workflows (no demo requests).

Run: docker compose exec api python -m scripts.seed_prod
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.security import hash_password
from app.db.models import Company, Role, User, UserRole, WorkflowDefinition
from app.db.session import SessionLocal
from scripts.seed import DEMO_WORKFLOWS, _add_published_workflow

ADMIN_EMAIL = "admin@demo.wizflow.biz"
ADMIN_PASSWORD = "changeme"
COMPANY_SLUG = "demo-co"
COMPANY_NAME = "Demo Company"
DEFAULT_ROLES = ("company_admin", "manager", "originator", "approver")


def seed_prod() -> None:
    db = SessionLocal()
    try:
        if db.scalar(select(Company).where(Company.slug == COMPANY_SLUG)):
            print("Production seed skipped — company already exists.")
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
            full_name="WizFlow Admin",
        )
        db.add(admin)
        db.flush()
        db.add(UserRole(user_id=admin.id, role_id=role_by_slug["company_admin"].id))
        db.add(UserRole(user_id=admin.id, role_id=role_by_slug["manager"].id))

        for spec in DEMO_WORKFLOWS:
            _add_published_workflow(db, company.id, spec)

        db.commit()
        print("Production seed complete.")
        print(f"  Admin login: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        print("  Change password after first login when user management is available.")
    finally:
        db.close()


if __name__ == "__main__":
    seed_prod()
