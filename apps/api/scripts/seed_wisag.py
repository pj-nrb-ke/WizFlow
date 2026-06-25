"""Bootstrap Wise & Agile Solutions Limited on a fresh database.

Creates: company, standard roles, admin account (pj@wizag.biz).
No demo workflows — build your own from the Workflows page.

Run against the live database:
    DATABASE_URL=postgresql://wizflow:wizflow@127.0.0.1:5466/wizflow_live \
        python apps/api/scripts/seed_wisag.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import secrets

from sqlalchemy import select

from app.core.security import hash_password
from app.db.models import Company, Role, User, UserRole
from app.db.session import SessionLocal

COMPANY_NAME = "Wise & Agile Solutions Limited"
COMPANY_SLUG = "wisag"
ADMIN_EMAIL = "pj@wizag.biz"
ADMIN_FULL_NAME = "PJ"
DEFAULT_ROLES = (
    ("company_admin", "Company Admin"),
    ("manager", "Manager"),
    ("approver", "Approver"),
    ("originator", "Originator"),
)


def run() -> None:
    db = SessionLocal()
    try:
        existing = db.scalar(select(Company).where(Company.slug == COMPANY_SLUG))
        if existing:
            print(f"Company '{COMPANY_NAME}' already exists in this database — skipping.")
            return

        company = Company(name=COMPANY_NAME, slug=COMPANY_SLUG, settings={})
        db.add(company)
        db.flush()

        roles: dict[str, Role] = {}
        for slug, label in DEFAULT_ROLES:
            r = Role(company_id=company.id, slug=slug, name=label)
            db.add(r)
            roles[slug] = r
        db.flush()

        temp_password = secrets.token_urlsafe(12)
        admin = User(
            company_id=company.id,
            email=ADMIN_EMAIL,
            password_hash=hash_password(temp_password),
            full_name=ADMIN_FULL_NAME,
        )
        db.add(admin)
        db.flush()

        # Grant admin both company_admin and manager roles
        db.add(UserRole(user_id=admin.id, role_id=roles["company_admin"].id))
        db.add(UserRole(user_id=admin.id, role_id=roles["manager"].id))

        db.commit()

        print("=" * 60)
        print("Wise & Agile Solutions Limited — database ready")
        print("=" * 60)
        print(f"  Login email : {ADMIN_EMAIL}")
        print(f"  Password    : {temp_password}")
        print()
        print("  Change your password after first login via Settings.")
        print("  Invite your team from Admin > Users > Invite.")
        print("=" * 60)
    finally:
        db.close()


if __name__ == "__main__":
    run()
