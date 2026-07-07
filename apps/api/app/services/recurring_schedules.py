"""Recurring schedules: calendar recurrence firing, per-target handlers, nagging.

A :class:`RecurringSchedule` is the pure "WHEN" — a named calendar rule ("every
X day of every Y week/month/year"). Each :class:`ScheduleTarget` on it is a
"WHAT": a workflow to submit, an acknowledge task, or a checklist to (re)open.

On each fire the scheduler finds every active target on a due schedule and runs
it through a per-kind handler:

* ``workflow`` / ``acknowledge`` → :func:`_run_obligation_target` opens a
  :class:`ScheduleRun` plus one :class:`ScheduleObligation` per recipient and
  sends the initial notification. Outstanding obligations are re-reminded on a
  cadence (:func:`process_schedule_reminders`) until done / max count / cutoff,
  with optional escalation to a supervisor.
* ``checklist`` → :func:`_run_checklist_target` spawns the next
  :class:`ChecklistInstance` (cloning the base instance's tasks), implementing
  checklist recurrence. No obligations.

The scheduler calls :func:`process_recurring_schedules` (open due runs) and
:func:`process_schedule_reminders` (nag stragglers) each tick.
"""

from __future__ import annotations

import calendar
import logging
from datetime import date, datetime, timedelta, timezone, tzinfo
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import (
    Checklist,
    ChecklistInstance,
    ChecklistTask,
    RecurringSchedule,
    ScheduleObligation,
    ScheduleRun,
    ScheduleTarget,
    User,
    WorkflowInstance,
)
from app.services.checklists import gen_token
from app.services.notifications import notify_users
from app.services.user_groups import expand_user_ids

logger = logging.getLogger("wizflow.recurring")

OBLIGATION_KINDS = ("workflow", "acknowledge")


# ── Recurrence math ─────────────────────────────────────────────────────────


def _tzinfo(name: str) -> tzinfo:
    try:
        return ZoneInfo(name or "UTC")
    except Exception:  # pragma: no cover - bad tz string, or a host without the tz database
        return timezone.utc


def _clamp_monthday(day: int, year: int, month: int) -> int:
    """Clamp a requested day-of-month to the last day of that month (e.g. 31 -> 28/29/30)."""
    last = calendar.monthrange(year, month)[1]
    return min(day, last)


def _months_between(a: date, b: date) -> int:
    return (b.year - a.year) * 12 + (b.month - a.month)


def schedule_due_on(sched: RecurringSchedule, d: date) -> bool:
    """True if the schedule's recurrence lands on calendar date ``d``.

    Intervals are anchored to ``start_date``: e.g. a quarterly (interval=3)
    monthly schedule started in January lands Jan/Apr/Jul/Oct.
    """
    if d < sched.start_date:
        return False
    if sched.end_date and d > sched.end_date:
        return False
    interval = max(1, sched.interval or 1)

    if sched.freq == "weekly":
        if sched.by_weekday is None or d.weekday() != sched.by_weekday:
            return False
        weeks = (d - sched.start_date).days // 7
        return weeks >= 0 and weeks % interval == 0

    if sched.freq == "monthly":
        if not sched.by_monthday:
            return False
        if d.day != _clamp_monthday(sched.by_monthday, d.year, d.month):
            return False
        months = _months_between(sched.start_date, d)
        return months >= 0 and months % interval == 0

    if sched.freq == "yearly":
        if not sched.by_month or not sched.by_monthday:
            return False
        if d.month != sched.by_month:
            return False
        if d.day != _clamp_monthday(sched.by_monthday, d.year, d.month):
            return False
        years = d.year - sched.start_date.year
        return years >= 0 and years % interval == 0

    return False


def _period_label(sched: RecurringSchedule, d: date) -> str:
    if sched.freq == "monthly":
        return d.strftime("%b %Y")
    if sched.freq == "yearly":
        return d.strftime("%Y")
    return d.isoformat()


def _target_label(sched: RecurringSchedule, target: ScheduleTarget) -> str:
    return (target.name or "").strip() or sched.name


def _form_url(target: ScheduleTarget) -> str:
    return f"{settings.app_url}/submit?wf={target.workflow_definition_id}"


def _recipient_ids(db: Session, target: ScheduleTarget) -> list[UUID]:
    return expand_user_ids(
        db,
        target.company_id,
        user_ids=[UUID(str(x)) for x in (target.recipient_user_ids or [])],
        group_ids=[UUID(str(x)) for x in (target.recipient_group_ids or [])],
    )


# ── Handlers: obligation targets (workflow / acknowledge) ────────────────────


def _send_initial(
    db: Session, sched: RecurringSchedule, target: ScheduleTarget, due_date: date, user_ids: list[UUID]
) -> None:
    label = _target_label(sched, target)
    if target.kind == "workflow" and target.workflow_definition_id:
        title = f"Action required: {label}"
        body = (
            f"{sched.description or label}\n\n"
            f"Please submit by {due_date.isoformat()}:\n{_form_url(target)}"
        )
    else:
        title = f"Reminder: {label}"
        body = sched.description or f"Please complete: {label}"
    notify_users(
        db,
        company_id=sched.company_id,
        user_ids=user_ids,
        title=title,
        body=body,
        send_email=True,
        send_push=True,
    )


def _run_obligation_target(
    db: Session, sched: RecurringSchedule, target: ScheduleTarget, due_date: date
) -> ScheduleRun:
    """Open a run + one obligation per recipient and send the initial notification."""
    run = ScheduleRun(
        company_id=sched.company_id,
        schedule_id=sched.id,
        target_id=target.id,
        due_date=due_date,
        period_label=_period_label(sched, due_date),
    )
    db.add(run)
    db.flush()

    created: list[UUID] = []
    for uid in _recipient_ids(db, target):
        db.add(
            ScheduleObligation(
                company_id=sched.company_id,
                schedule_id=sched.id,
                target_id=target.id,
                run_id=run.id,
                user_id=uid,
                status="outstanding",
            )
        )
        created.append(uid)

    if created:
        db.flush()
        _send_initial(db, sched, target, due_date, created)
    return run


# ── Handler: checklist target (spawn the next ChecklistInstance) ─────────────


def _run_checklist_target(
    db: Session, sched: RecurringSchedule, target: ScheduleTarget, due_date: date
) -> ScheduleRun | None:
    """Open the next period of the target's checklist by cloning the base instance's tasks."""
    if not target.checklist_id:
        return None
    checklist = db.get(Checklist, target.checklist_id)
    if not checklist or checklist.company_id != sched.company_id:
        return None

    # Next sequence number (max existing + 1).
    max_seq = db.scalar(
        select(func.max(ChecklistInstance.sequence)).where(
            ChecklistInstance.checklist_id == checklist.id
        )
    ) or 0
    next_seq = max_seq + 1

    # Period window mirrors the checklist's own start -> due span.
    span = (checklist.due_date - checklist.start_date).days
    period_start = due_date
    period_end = due_date + timedelta(days=span) if span > 0 else due_date

    inst = ChecklistInstance(
        company_id=sched.company_id,
        checklist_id=checklist.id,
        period_start=period_start,
        period_end=period_end,
        sequence=next_seq,
        status="active",
    )
    db.add(inst)
    db.flush()

    # Clone the tasks from the base (sequence == 1) instance.
    assignees: list[UUID] = []
    base = db.scalar(
        select(ChecklistInstance).where(
            ChecklistInstance.checklist_id == checklist.id,
            ChecklistInstance.sequence == 1,
        )
    )
    if base:
        base_tasks = db.scalars(
            select(ChecklistTask)
            .where(ChecklistTask.instance_id == base.id)
            .order_by(ChecklistTask.order_index)
        )
        for t in base_tasks:
            db.add(
                ChecklistTask(
                    company_id=sched.company_id,
                    checklist_id=checklist.id,
                    instance_id=inst.id,
                    title=t.title,
                    description=t.description,
                    assignee_user_id=t.assignee_user_id,
                    priority=t.priority,
                    weight=t.weight,
                    attachment_required=t.attachment_required,
                    order_index=t.order_index,
                    status="not_started",
                    access_token=gen_token(),
                )
            )
            if t.assignee_user_id:
                assignees.append(t.assignee_user_id)
        db.flush()

    run = ScheduleRun(
        company_id=sched.company_id,
        schedule_id=sched.id,
        target_id=target.id,
        due_date=due_date,
        period_label=_period_label(sched, due_date),
        checklist_instance_id=inst.id,
    )
    db.add(run)
    db.flush()

    # Let the distinct task assignees know a new checklist period is open.
    distinct = list(dict.fromkeys(assignees))
    if distinct:
        notify_users(
            db,
            company_id=sched.company_id,
            user_ids=distinct,
            title=f"New checklist period: {checklist.name}",
            body=f"A new period for '{checklist.name}' is now open (due {period_end.isoformat()}).",
            send_email=True,
            send_push=True,
        )
    return run


TARGET_HANDLERS = {
    "workflow": _run_obligation_target,
    "acknowledge": _run_obligation_target,
    "checklist": _run_checklist_target,
}


# ── Firing: open due runs ────────────────────────────────────────────────────


def run_due_targets(db: Session, sched: RecurringSchedule, due_date: date) -> int:
    """Run every active target on ``sched`` for ``due_date`` (idempotent per target).

    Returns the number of newly-opened runs. Does not commit.
    """
    opened = 0
    for target in sched.targets:
        if not target.is_active:
            continue
        existing = db.scalar(
            select(ScheduleRun).where(
                ScheduleRun.target_id == target.id,
                ScheduleRun.due_date == due_date,
            )
        )
        if existing:
            continue
        handler = TARGET_HANDLERS.get(target.kind)
        if handler is None:
            logger.warning("Unknown target kind %r on schedule %s", target.kind, sched.id)
            continue
        handler(db, sched, target, due_date)
        opened += 1
    return opened


def process_recurring_schedules(db: Session, *, company_id: UUID | None = None) -> int:
    """Open runs for every active schedule that is due today (local) and not yet run."""
    now = datetime.now(timezone.utc)
    q = select(RecurringSchedule).where(RecurringSchedule.is_active.is_(True))
    if company_id:
        q = q.where(RecurringSchedule.company_id == company_id)

    opened = 0
    for sched in db.scalars(q):
        try:
            local = now.astimezone(_tzinfo(sched.timezone))
            today = local.date()
            if local.hour < sched.at_hour:
                continue
            if not schedule_due_on(sched, today):
                continue
            n = run_due_targets(db, sched, today)
            if n:
                sched.last_run_at = now
                opened += n
        except Exception as e:  # pragma: no cover - keep other schedules alive
            logger.warning("Failed to run schedule %s: %s", sched.id, e)
    db.commit()
    return opened


# ── Nagging + escalation ────────────────────────────────────────────────────


def _nag_body(sched: RecurringSchedule, target: ScheduleTarget, due_date: date) -> str:
    label = _target_label(sched, target)
    if target.kind == "workflow" and target.workflow_definition_id:
        return (
            f"Still outstanding: {label} (due {due_date.isoformat()}).\n\n"
            f"Submit here:\n{_form_url(target)}"
        )
    return f"Still outstanding: {label} (due {due_date.isoformat()}). Please mark it done once handled."


def process_schedule_reminders(db: Session, *, company_id: UUID | None = None) -> int:
    """Re-remind recipients with outstanding obligations; escalate to supervisor past threshold.

    Iterates active, remind-enabled targets and reads the reminder / escalation
    config from the target (not the schedule).
    """
    now = datetime.now(timezone.utc)
    q = (
        select(ScheduleTarget)
        .join(RecurringSchedule, RecurringSchedule.id == ScheduleTarget.schedule_id)
        .where(
            RecurringSchedule.is_active.is_(True),
            ScheduleTarget.is_active.is_(True),
            ScheduleTarget.remind_enabled.is_(True),
        )
    )
    if company_id:
        q = q.where(ScheduleTarget.company_id == company_id)

    sent = 0
    for target in db.scalars(q):
        sched = db.get(RecurringSchedule, target.schedule_id)
        if not sched:
            continue
        tz = _tzinfo(sched.timezone)
        local = now.astimezone(tz)
        today = local.date()
        if local.hour < sched.at_hour:
            continue
        interval = max(1, target.remind_interval_days or 1)
        label = _target_label(sched, target)

        obligations = db.scalars(
            select(ScheduleObligation).where(
                ScheduleObligation.target_id == target.id,
                ScheduleObligation.status == "outstanding",
            )
        )
        for ob in obligations:
            run = db.get(ScheduleRun, ob.run_id)
            if not run:
                continue
            days_since_due = (today - run.due_date).days
            # Nag only after the due date, on the cadence (daily -> every day; N -> every Nth day).
            if days_since_due < 1 or days_since_due % interval != 0:
                continue
            # Stop conditions: max count / cutoff window.
            if target.remind_max_count is not None and ob.reminder_count >= target.remind_max_count:
                continue
            if target.remind_window_days is not None and days_since_due > target.remind_window_days:
                continue
            # One nag per local day.
            if ob.last_reminded_at is not None and ob.last_reminded_at.astimezone(tz).date() >= today:
                continue

            notify_users(
                db,
                company_id=sched.company_id,
                user_ids=[ob.user_id],
                title=f"Reminder: {label}",
                body=_nag_body(sched, target, run.due_date),
                send_email=True,
                send_push=True,
            )
            ob.reminder_count += 1
            ob.last_reminded_at = now
            sent += 1

            # Escalate to supervisor once, after the configured number of nags.
            if (
                target.escalate_after_count is not None
                and target.supervisor_user_id
                and ob.escalated_at is None
                and ob.reminder_count >= target.escalate_after_count
            ):
                who = db.get(User, ob.user_id)
                notify_users(
                    db,
                    company_id=sched.company_id,
                    user_ids=[target.supervisor_user_id],
                    title=f"Escalation: {label} overdue",
                    body=(
                        f"{who.full_name if who else 'A recipient'} has not completed "
                        f"'{label}' (due {run.due_date.isoformat()}, "
                        f"{ob.reminder_count} reminders sent)."
                    ),
                    send_email=True,
                    send_push=True,
                )
                ob.escalated_at = now
    db.commit()
    return sent


# ── Completion ──────────────────────────────────────────────────────────────


def close_obligations_for_instance(db: Session, instance: WorkflowInstance) -> int:
    """Mark outstanding workflow obligations done when their owner submits the workflow.

    Matches by (originator, workflow_definition) against workflow-kind targets.
    Called from the submit endpoint; does not commit (the caller owns the txn).
    """
    if not instance.workflow_definition_id or not instance.originator_user_id:
        return 0
    rows = db.scalars(
        select(ScheduleObligation)
        .join(ScheduleTarget, ScheduleTarget.id == ScheduleObligation.target_id)
        .where(
            ScheduleObligation.user_id == instance.originator_user_id,
            ScheduleObligation.status == "outstanding",
            ScheduleTarget.kind == "workflow",
            ScheduleTarget.workflow_definition_id == instance.workflow_definition_id,
        )
    )
    n = 0
    for ob in rows:
        ob.status = "submitted"
        ob.completed_at = datetime.now(timezone.utc)
        ob.instance_id = instance.id
        n += 1
    return n


def acknowledge_obligation(
    db: Session, obligation_id: UUID, user_id: UUID
) -> ScheduleObligation | None:
    """Recipient marks their own (acknowledge-mode) obligation done."""
    ob = db.get(ScheduleObligation, obligation_id)
    if not ob or ob.user_id != user_id:
        return None
    if ob.status == "outstanding":
        ob.status = "submitted"
        ob.completed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(ob)
    return ob
