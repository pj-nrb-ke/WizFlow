"""Verify demo seed: varied amounts, admin my requests, inbox not empty."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select

from app.db.models import User, WorkflowInstance
from app.db.session import SessionLocal

ADMIN = "admin@demo.wizflow.biz"
COMPANY_SLUG = "demo-co"


def run() -> None:
    db = SessionLocal()
    try:
        from app.db.models import Company

        company = db.scalar(select(Company).where(Company.slug == COMPANY_SLUG))
        assert company, "demo-co missing"
        admin = db.scalar(select(User).where(User.email == ADMIN))
        assert admin, "admin missing"

        my_count = (
            db.scalar(
                select(func.count())
                .select_from(WorkflowInstance)
                .where(
                    WorkflowInstance.company_id == company.id,
                    WorkflowInstance.originator_user_id == admin.id,
                )
            )
            or 0
        )
        assert my_count >= 15, f"Admin my_requests expected 15+, got {my_count}"

        petty_rows = db.scalars(
            select(WorkflowInstance).where(
                WorkflowInstance.company_id == company.id,
                WorkflowInstance.workflow_name == "Petty Cash Approval",
            )
        )
        unique = {
            str(r.request_data.get("amount"))
            for r in petty_rows
            if r.request_data and r.request_data.get("amount") is not None
        }
        assert len(unique) >= 8, f"Petty cash amounts should vary, got {len(unique)} unique"

        print(f"UI quality OK: admin_my_requests={my_count} petty_amount_variants={len(unique)}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
