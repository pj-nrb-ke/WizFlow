"""Seed a rich demo for the Recurring Schedules feature.

Idempotent — safe to re-run. Everything is looked up by name and reused, never
duplicated. Creates, for the demo company (admin@demo.wizflow.biz):

  1. Schedule "Every 15th of the month" (monthly, day-15, 09:00)
       * Target A  kind=workflow    -> "Monthly Fee Note" workflow, 3 consultant
                                        recipients, nag every 2 days (max 5),
                                        escalate to the admin after 3 reminders.
       * Target B  kind=checklist   -> "Month-end close" checklist (created here
                                        with 4 tasks if missing) — demonstrates
                                        checklist recurrence.
  2. Schedule "Quarterly hosting billing" (monthly, interval 3, day-1) with a
     single acknowledge target to the accountant (nag daily).
  3. A live run for the "Every 15th" schedule so the Compliance view has data:
     opens ScheduleRun + one ScheduleObligation per recipient, has one consultant
     submit (their obligation auto-closes), then simulates several days of nagging
     so the other two cross the escalation threshold.

Run inside the api container (repo apps/api is mounted at /app):
    docker exec wizflow-api-1 python /app/seed_recurring_schedules_demo.py
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select

from app.db.models import (
    Checklist,
    ChecklistInstance,
    ChecklistTask,
    RecurringSchedule,
    ScheduleObligation,
    ScheduleRun,
    ScheduleTarget,
    User,
    WorkflowDefinition,
)
from app.db.session import SessionLocal
from app.services.checklists import gen_token
from app.services.instance_engine import submit_request
from app.services.recurring_schedules import (
    close_obligations_for_instance,
    process_schedule_reminders,
    run_due_targets,
)

# ── Config ───────────────────────────────────────────────────────────────────
ADMIN_EMAIL = "admin@demo.wizflow.biz"
CONSULTANT_EMAILS = [
    "james@demo.wizflow.biz",
    "peter@demo.wizflow.biz",
    "mary@demo.wizflow.biz",
]
ACCOUNTANT_EMAIL = "acc1@demo.wizflow.biz"

WORKFLOW_NAME = "Monthly Fee Note"
SCHED1_NAME = "Every 15th of the month"
SCHED2_NAME = "Quarterly hosting billing"
CHECKLIST_NAME = "Month-end close"

TARGET_A_NAME = "Monthly Fee Note submission"
TARGET_B_NAME = "Month-end close checklist"
TARGET_ACK_NAME = "Acknowledge quarterly hosting billing"

DEFAULT_TZ = "Africa/Nairobi"


# ── Small helpers ────────────────────────────────────────────────────────────
def _get_user(db, company_id, email):
    return db.scalar(
        select(User).where(User.company_id == company_id, User.email == email)
    )


def _company_timezone(company) -> str:
    tz = ((company.settings or {}).get("timezone") if company else None) or DEFAULT_TZ
    return tz


def _last_day_of_month(d: date) -> date:
    if d.month == 12:
        nxt = date(d.year + 1, 1, 1)
    else:
        nxt = date(d.year, d.month + 1, 1)
    return nxt - timedelta(days=1)


def _prev_month(y: int, m: int) -> tuple[int, int]:
    return (y - 1, 12) if m == 1 else (y, m - 1)


def _pick_overdue_15th(today: date) -> date:
    """Most recent day-15 that is at least 2 days ago with an *even* day-gap.

    Target A nags every 2 days, and the nag predicate is
    ``days_since_due % interval == 0`` against a fixed "today", so the run's
    due date must sit an even number of days in the past for the escalation
    simulation to fire deterministically.
    """
    y, m = today.year, today.month
    for _ in range(12):
        c = date(y, m, 15)
        if c <= today:
            gap = (today - c).days
            if gap >= 2 and gap % 2 == 0:
                return c
        y, m = _prev_month(y, m)
    # Fallback: a safe even-gap date two days back.
    return today - timedelta(days=2)


# ── Workflow (reuse if present, else create — mirrors the old seed) ──────────
def _ensure_workflow(db, company_id, accountant_ids) -> WorkflowDefinition:
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
                "assignee": {
                    "type": "users",
                    "user_ids": [str(x) for x in accountant_ids],
                    "mode": "claim",
                },
            },
        ],
        routing_rules=[],
        settings={},  # no custom_workflow -> any company user may initiate
    )
    db.add(defn)
    db.flush()
    print(f"  + created published workflow '{WORKFLOW_NAME}' ({defn.id})")
    return defn


# ── Checklist "Month-end close" (mirrors routers/checklists.create_checklist) ─
def _ensure_checklist(db, company_id, admin_id, assignees) -> Checklist:
    existing = db.scalar(
        select(Checklist).where(
            Checklist.company_id == company_id, Checklist.name == CHECKLIST_NAME
        )
    )
    if existing:
        print(f"  = checklist '{CHECKLIST_NAME}' already exists ({existing.id})")
        return existing

    today = date.today()
    start = date(today.year, today.month, 1)
    due = _last_day_of_month(today)

    cl = Checklist(
        company_id=company_id,
        name=CHECKLIST_NAME,
        description="Month-end financial close: reconcile, accrue, review and report.",
        category="Finance",
        timezone=DEFAULT_TZ,
        start_date=start,
        due_date=due,
        recurrence="none",  # the recurring schedule drives recurrence
        recurrence_config={},
        carry_over="reset",
        verification_required=False,
        completion_rule="all",
        completion_threshold=100,
        created_by=admin_id,
    )
    db.add(cl)
    db.flush()

    inst = ChecklistInstance(
        company_id=company_id,
        checklist_id=cl.id,
        period_start=start,
        period_end=due,
        sequence=1,
        status="active",
    )
    db.add(inst)
    db.flush()

    a0 = assignees[0].id if len(assignees) > 0 else None
    a1 = assignees[1].id if len(assignees) > 1 else a0
    task_specs = [
        ("Reconcile all bank statements", a0, "high"),
        ("Post accruals & prepayments", a1, "normal"),
        ("Review the trial balance", a0, "normal"),
        ("Prepare management accounts pack", a1, "high"),
    ]
    for i, (title, uid, priority) in enumerate(task_specs):
        db.add(
            ChecklistTask(
                company_id=company_id,
                checklist_id=cl.id,
                instance_id=inst.id,
                title=title,
                assignee_user_id=uid,
                priority=priority,
                weight=1,
                attachment_required=False,
                order_index=i,
                status="not_started",
                access_token=gen_token(),
            )
        )
    db.flush()
    print(f"  + created checklist '{CHECKLIST_NAME}' ({cl.id}) with {len(task_specs)} tasks")
    return cl


# ── Schedules & targets (idempotent upsert by name) ──────────────────────────
def _ensure_schedule(db, company_id, admin_id, name, tz, **fields) -> RecurringSchedule:
    sched = db.scalar(
        select(RecurringSchedule).where(
            RecurringSchedule.company_id == company_id, RecurringSchedule.name == name
        )
    )
    if sched:
        for k, v in fields.items():
            setattr(sched, k, v)
        sched.timezone = tz
        sched.is_active = True
        print(f"  = updated schedule '{name}' ({sched.id})")
        return sched
    sched = RecurringSchedule(
        company_id=company_id,
        name=name,
        timezone=tz,
        is_active=True,
        created_by=admin_id,
        **fields,
    )
    db.add(sched)
    db.flush()
    print(f"  + created schedule '{name}' ({sched.id})")
    return sched


def _ensure_target(db, company_id, schedule_id, name, **fields) -> ScheduleTarget:
    tgt = db.scalar(
        select(ScheduleTarget).where(
            ScheduleTarget.schedule_id == schedule_id, ScheduleTarget.name == name
        )
    )
    if tgt:
        for k, v in fields.items():
            setattr(tgt, k, v)
        tgt.is_active = True
        print(f"    = updated target '{name}' ({tgt.id})")
        return tgt
    tgt = ScheduleTarget(
        company_id=company_id,
        schedule_id=schedule_id,
        name=name,
        is_active=True,
        **fields,
    )
    db.add(tgt)
    db.flush()
    print(f"    + created target '{name}' ({tgt.id})")
    return tgt


# ── Live run + compliance/escalation state (mirrors the old seed_recurring_state) ─
def _establish_demo_run(db, company_id, sched, target_a, defn, james, run_due_date) -> None:
    """Open a run for the schedule, submit one obligation, nag the rest to escalation.

    Idempotent: only fires when Target A has no runs yet.
    """
    if db.scalar(select(ScheduleRun).where(ScheduleRun.target_id == target_a.id)):
        print("  = demo run already present — leaving run/obligation state untouched")
        return

    # Open runs for every active target on the schedule (Target A obligations +
    # Target B checklist period). Idempotent per (target, due_date).
    opened = run_due_targets(db, sched, run_due_date)
    db.commit()
    print(f"  + opened {opened} run(s) for '{sched.name}' due {run_due_date}")

    # One consultant submits the fee note -> their obligation auto-closes.
    james_ob = db.scalar(
        select(ScheduleObligation).where(
            ScheduleObligation.target_id == target_a.id,
            ScheduleObligation.user_id == james.id,
            ScheduleObligation.status == "outstanding",
        )
    )
    if james_ob:
        inst = submit_request(
            db,
            defn=defn,
            user_id=james.id,
            company_id=company_id,
            data={
                "period": run_due_date.strftime("%B %Y"),
                "amount": 1500,
                "note": "Consulting fees",
            },
        )
        closed = close_obligations_for_instance(db, inst)
        db.commit()
        print(f"  + {james.full_name} submitted {inst.reference_number} -> closed {closed} obligation(s)")

    # Simulate several days of nagging so the stragglers escalate. Drop at_hour to
    # 0 while simulating so the reminder hour-guard never skips, then restore it.
    orig_hour = sched.at_hour
    sched.at_hour = 0
    db.commit()
    for _ in range(4):
        for ob in db.scalars(
            select(ScheduleObligation).where(
                ScheduleObligation.target_id == target_a.id,
                ScheduleObligation.status == "outstanding",
            )
        ):
            if ob.last_reminded_at:  # pretend a day passed since the last nag
                ob.last_reminded_at = ob.last_reminded_at - timedelta(days=1)
        db.commit()
        process_schedule_reminders(db, company_id=company_id)
    sched.at_hour = orig_hour
    db.commit()
    print("  + simulated reminder cadence + escalation for outstanding recipients")


# ── Main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    db = SessionLocal()
    try:
        admin = db.scalar(select(User).where(User.email == ADMIN_EMAIL))
        if not admin:
            raise SystemExit(f"{ADMIN_EMAIL} not found — is the demo DB seeded?")
        cid = admin.company_id
        tz = _company_timezone(admin.company)
        print(f"Company: {cid}  (timezone: {tz})")

        consultants = [u for u in (_get_user(db, cid, e) for e in CONSULTANT_EMAILS) if u]
        if not consultants:
            raise SystemExit("No consultant/originator demo users found.")
        james = consultants[0]
        accountant = _get_user(db, cid, ACCOUNTANT_EMAIL) or admin
        accountant_ids = [accountant.id]

        defn = _ensure_workflow(db, cid, accountant_ids)
        checklist = _ensure_checklist(db, cid, admin.id, consultants)

        today = date.today()
        run_due_date = _pick_overdue_15th(today)

        # ── Schedule 1: Every 15th of the month ──
        sched1 = _ensure_schedule(
            db, cid, admin.id, SCHED1_NAME, tz,
            description="Submit the monthly fee note and run the month-end close.",
            freq="monthly",
            interval=1,
            by_monthday=15,
            by_weekday=None,
            by_month=None,
            at_hour=9,
            start_date=run_due_date,
            end_date=None,
        )
        target_a = _ensure_target(
            db, cid, sched1.id, TARGET_A_NAME,
            kind="workflow",
            workflow_definition_id=defn.id,
            checklist_id=None,
            recipient_user_ids=[str(c.id) for c in consultants],
            recipient_group_ids=[],
            remind_enabled=True,
            remind_interval_days=2,
            remind_max_count=5,
            remind_window_days=None,
            escalate_after_count=3,
            supervisor_user_id=admin.id,
        )
        target_b = _ensure_target(
            db, cid, sched1.id, TARGET_B_NAME,
            kind="checklist",
            workflow_definition_id=None,
            checklist_id=checklist.id,
            recipient_user_ids=[],
            recipient_group_ids=[],
            remind_enabled=False,  # checklist targets don't raise obligations
        )

        # ── Schedule 2: Quarterly hosting billing ──
        sched2 = _ensure_schedule(
            db, cid, admin.id, SCHED2_NAME, tz,
            description="Bill all hosting customers for the quarter, then acknowledge.",
            freq="monthly",
            interval=3,
            by_monthday=1,
            by_weekday=None,
            by_month=None,
            at_hour=9,
            start_date=date(today.year, today.month, 1),
            end_date=None,
        )
        target_ack = _ensure_target(
            db, cid, sched2.id, TARGET_ACK_NAME,
            kind="acknowledge",
            workflow_definition_id=None,
            checklist_id=None,
            recipient_user_ids=[str(accountant.id)],
            recipient_group_ids=[],
            remind_enabled=True,
            remind_interval_days=1,
            remind_max_count=10,
            remind_window_days=None,
            escalate_after_count=None,
            supervisor_user_id=None,
        )

        db.commit()

        # ── Open a live run + compliance/escalation state for Schedule 1 ──
        db.refresh(sched1)
        _establish_demo_run(db, cid, sched1, target_a, defn, james, run_due_date)

        # ── Summary ──
        print("\n" + "=" * 68)
        print("SEED SUMMARY")
        print("=" * 68)

        def _oblig_count(target_id):
            return db.scalar(
                select(func.count()).select_from(ScheduleObligation).where(
                    ScheduleObligation.target_id == target_id
                )
            )

        print(f"\nSchedule 1: '{sched1.name}'  id={sched1.id}")
        print(f"  monthly, interval={sched1.interval}, day={sched1.by_monthday}, "
              f"at {sched1.at_hour:02d}:00 {sched1.timezone}, start={sched1.start_date}")
        print(f"  Target A [workflow]  '{target_a.name}' -> WF '{WORKFLOW_NAME}' "
              f"({defn.id}); recipients={len(target_a.recipient_user_ids)}; "
              f"obligations={_oblig_count(target_a.id)}")
        print(f"  Target B [checklist] '{target_b.name}' -> checklist '{checklist.name}' "
              f"({checklist.id})")

        print(f"\nSchedule 2: '{sched2.name}'  id={sched2.id}")
        print(f"  monthly, interval={sched2.interval}, day={sched2.by_monthday}, "
              f"at {sched2.at_hour:02d}:00 {sched2.timezone}, start={sched2.start_date}")
        print(f"  Target [acknowledge] '{target_ack.name}' -> recipient "
              f"'{accountant.email}'; recipients={len(target_ack.recipient_user_ids)}")

        # Obligation status breakdown for Target A.
        print(f"\nTarget A obligation state ({run_due_date} period):")
        rows = db.scalars(
            select(ScheduleObligation).where(ScheduleObligation.target_id == target_a.id)
        )
        for ob in rows:
            u = db.get(User, ob.user_id)
            print(f"  {(u.full_name if u else str(ob.user_id)):16} "
                  f"{ob.status:11} reminders={ob.reminder_count} "
                  f"escalated={ob.escalated_at is not None}")

        # Checklist instances (periods) spawned.
        inst_count = db.scalar(
            select(func.count()).select_from(ChecklistInstance).where(
                ChecklistInstance.checklist_id == checklist.id
            )
        )
        print(f"\nChecklist '{checklist.name}': {inst_count} period instance(s)")

        # ── Verify committed by re-querying company-wide counts ──
        print("\nFinal committed counts (company scope):")
        for label, model in [
            ("recurring_schedules", RecurringSchedule),
            ("schedule_targets", ScheduleTarget),
            ("schedule_runs", ScheduleRun),
            ("schedule_obligations", ScheduleObligation),
        ]:
            n = db.scalar(
                select(func.count()).select_from(model).where(model.company_id == cid)
            )
            print(f"  {label:22} {n}")

        print("\nSeed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
