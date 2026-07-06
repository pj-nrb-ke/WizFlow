"""Seed demo data for the Recurring Activities feature.

Idempotent. Creates:
  * three consultant users (James, Peter, Mary) who can initiate workflows
  * a published "Monthly Fee Note" workflow (Manager approval -> Accountant approval)
  * a "Monthly Fee Note" recurring activity (submit_workflow, monthly on today's
    day-of-month, nag daily, escalate to the admin after 3 reminders)
  * a "Bill hosting customers (quarterly)" recurring activity (acknowledge mode)

Run inside the api container:  python seed_recurring_demo.py
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.security import hash_password
from app.db.models import (
    RecurringActivity,
    Role,
    User,
    UserRole,
    WorkflowDefinition,
)
from app.db.session import SessionLocal

CONSULTANTS = [
    ("james@demo.wizflow.biz", "James Mwangi"),
    ("peter@demo.wizflow.biz", "Peter Otieno"),
    ("mary@demo.wizflow.biz", "Mary Wanjiru"),
]
ACCOUNTANTS = ["acc1@demo.wizflow.biz", "acc2@demo.wizflow.biz"]
WORKFLOW_NAME = "Monthly Fee Note"
ACTIVITY_NAME = "Monthly Fee Note"
HOSTING_NAME = "Bill hosting customers (quarterly)"


def _get_user(db, company_id, email):
    return db.scalar(select(User).where(User.company_id == company_id, User.email == email))


def _ensure_consultant(db, company_id, originator_role_id, email, full_name):
    u = _get_user(db, company_id, email)
    if u:
        return u
    u = User(
        company_id=company_id,
        email=email,
        full_name=full_name,
        password_hash=hash_password("changeme"),
        is_active=True,
    )
    db.add(u)
    db.flush()
    if originator_role_id:
        db.add(UserRole(user_id=u.id, role_id=originator_role_id))
    print(f"  + created consultant {full_name} <{email}>")
    return u


def _ensure_workflow(db, company_id, accountant_ids):
    existing = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.company_id == company_id,
            WorkflowDefinition.name == WORKFLOW_NAME,
            WorkflowDefinition.status == "published",
        )
    )
    if existing:
        return existing
    defn = WorkflowDefinition(
        company_id=company_id,
        name=WORKFLOW_NAME,
        family_id=uuid.uuid4(),
        version=1,
        status="published",
        form_schema={
            "fields": [
                {"key": "period", "label": "Billing period", "type": "text", "required": True},
                {"key": "amount", "label": "Amount", "type": "number", "required": True},
                {"key": "note", "label": "Note", "type": "text", "required": False},
            ]
        },
        steps=[
            {
                "id": "step_admin",
                "name": "Manager Approval",
                "type": "approval",
                "assignee": {"type": "role", "value": "company_admin"},
            },
            {
                "id": "step_accountant",
                "name": "Accountant Approval",
                "type": "approval",
                "assignee": {"type": "users", "user_ids": [str(x) for x in accountant_ids], "mode": "claim"},
            },
        ],
        routing_rules=[],
        settings={},  # no custom_workflow -> any company user may initiate
    )
    db.add(defn)
    db.flush()
    print(f"  + created published workflow '{WORKFLOW_NAME}' ({defn.id})")
    return defn


def _ensure_activity(db, company_id, defn_id, recipient_ids, supervisor_id, admin_id):
    existing = db.scalar(
        select(RecurringActivity).where(
            RecurringActivity.company_id == company_id,
            RecurringActivity.name == ACTIVITY_NAME,
        )
    )
    today = datetime.now(timezone.utc).date()
    if existing:
        # keep it pointed at today's day-of-month so the demo can fire now
        existing.by_monthday = today.day
        existing.workflow_definition_id = defn_id
        existing.recipient_user_ids = [str(x) for x in recipient_ids]
        existing.supervisor_user_id = supervisor_id
        print(f"  = updated activity '{ACTIVITY_NAME}' ({existing.id})")
        return existing
    act = RecurringActivity(
        company_id=company_id,
        name=ACTIVITY_NAME,
        description="Upload your monthly fee note. It routes to the manager, then the accountant.",
        freq="monthly",
        interval=1,
        by_monthday=today.day,
        at_hour=0,  # demo: fire at any hour today
        timezone="UTC",
        start_date=today,
        completion_mode="submit_workflow",
        workflow_definition_id=defn_id,
        recipient_user_ids=[str(x) for x in recipient_ids],
        remind_enabled=True,
        remind_interval_days=1,
        remind_max_count=10,
        escalate_after_count=3,
        supervisor_user_id=supervisor_id,
        created_by=admin_id,
    )
    db.add(act)
    db.flush()
    print(f"  + created activity '{ACTIVITY_NAME}' ({act.id})")
    return act


def _ensure_hosting_activity(db, company_id, accountant_id, supervisor_id, admin_id):
    existing = db.scalar(
        select(RecurringActivity).where(
            RecurringActivity.company_id == company_id,
            RecurringActivity.name == HOSTING_NAME,
        )
    )
    if existing:
        print(f"  = activity '{HOSTING_NAME}' already exists ({existing.id})")
        return existing
    act = RecurringActivity(
        company_id=company_id,
        name=HOSTING_NAME,
        description="Bill all hosting customers for the quarter, then mark this done.",
        freq="monthly",
        interval=3,  # quarterly
        by_monthday=1,
        at_hour=9,
        timezone="UTC",
        start_date=datetime.now(timezone.utc).date(),
        completion_mode="acknowledge",
        recipient_user_ids=[str(accountant_id)] if accountant_id else [],
        remind_enabled=True,
        remind_interval_days=1,
        remind_max_count=10,
        escalate_after_count=2,
        supervisor_user_id=supervisor_id,
        created_by=admin_id,
    )
    db.add(act)
    db.flush()
    print(f"  + created activity '{HOSTING_NAME}' ({act.id})")
    return act


def main() -> None:
    db = SessionLocal()
    try:
        admin = db.scalar(select(User).where(User.email == "admin@demo.wizflow.biz"))
        if not admin:
            raise SystemExit("admin@demo.wizflow.biz not found — is the demo DB seeded?")
        company_id = admin.company_id
        print(f"Company: {company_id}")

        originator_role = db.scalar(
            select(Role).where(Role.company_id == company_id, Role.slug == "originator")
        )
        originator_role_id = originator_role.id if originator_role else None

        consultants = [
            _ensure_consultant(db, company_id, originator_role_id, email, name)
            for email, name in CONSULTANTS
        ]
        accountants = [u for u in (_get_user(db, company_id, e) for e in ACCOUNTANTS) if u]
        accountant_ids = [u.id for u in accountants] or [admin.id]

        defn = _ensure_workflow(db, company_id, accountant_ids)
        _ensure_activity(
            db, company_id, defn.id, [c.id for c in consultants], supervisor_id=admin.id, admin_id=admin.id
        )
        _ensure_hosting_activity(
            db, company_id, accountant_ids[0], supervisor_id=admin.id, admin_id=admin.id
        )

        db.commit()
        print("\nSeed complete.")
        print(f"  Consultants: {', '.join(e for e, _ in CONSULTANTS)} (password: changeme)")
        print(f"  Workflow:    {WORKFLOW_NAME} ({defn.id})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
