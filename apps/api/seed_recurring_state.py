"""Populate a realistic demo state for the Monthly Fee Note activity.

Idempotent: resets the activity's cycles, opens today's cycle, has James submit
(his obligation closes), and simulates a few days of nagging on Peter & Mary so
one of them crosses the escalation threshold. Run in the api container.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db.models import (
    ActivityCycle,
    ActivityObligation,
    RecurringActivity,
    User,
    WorkflowDefinition,
)
from app.db.session import SessionLocal
from app.services.instance_engine import submit_request
from app.services.recurring_activities import (
    close_obligations_for_instance,
    open_cycle,
    process_activity_reminders,
)


def main() -> None:
    db = SessionLocal()
    try:
        admin = db.scalar(select(User).where(User.email == "admin@demo.wizflow.biz"))
        cid = admin.company_id
        act = db.scalar(
            select(RecurringActivity).where(
                RecurringActivity.company_id == cid, RecurringActivity.name == "Monthly Fee Note"
            )
        )
        if not act:
            raise SystemExit("Run seed_recurring_demo.py first")
        james = db.scalar(select(User).where(User.email == "james@demo.wizflow.biz"))

        # Clean slate.
        for c in db.scalars(select(ActivityCycle).where(ActivityCycle.activity_id == act.id)):
            db.delete(c)
        db.commit()

        today = datetime.now(timezone.utc).date()
        cyc = open_cycle(db, act, today)
        db.commit()
        print(f"Opened cycle {cyc.due_date} with {len(cyc.obligations)} obligations")

        # James submits the fee note -> his obligation auto-closes.
        defn = db.get(WorkflowDefinition, act.workflow_definition_id)
        inst = submit_request(
            db, defn=defn, user_id=james.id, company_id=cid,
            data={"period": "July 2026", "amount": 1500, "note": "Consulting fees — July"},
        )
        closed = close_obligations_for_instance(db, inst)
        db.commit()
        print(f"James submitted {inst.reference_number} -> closed {closed} obligation(s)")

        # Simulate several days of daily nagging on the still-outstanding recipients.
        cyc.due_date = today - timedelta(days=1)
        db.commit()
        for _ in range(4):
            for ob in db.scalars(
                select(ActivityObligation).where(
                    ActivityObligation.cycle_id == cyc.id, ActivityObligation.status == "outstanding"
                )
            ):
                if ob.last_reminded_at:  # pretend a day passed since the last nag
                    ob.last_reminded_at = ob.last_reminded_at - timedelta(days=1)
            db.commit()
            process_activity_reminders(db, company_id=cid)

        print("\nFinal state:")
        for ob in db.scalars(select(ActivityObligation).where(ActivityObligation.cycle_id == cyc.id)):
            u = db.get(User, ob.user_id)
            print(f"  {u.full_name:16} {ob.status:10} reminders={ob.reminder_count} escalated={ob.escalated_at is not None}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
