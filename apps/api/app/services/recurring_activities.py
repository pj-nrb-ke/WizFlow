"""Recurring activities: calendar recurrence firing, obligation nagging, escalation.

A ``RecurringActivity`` fires on a calendar recurrence ("every X day of every Y
week/month/year"). Each firing opens an ``ActivityCycle`` and one
``ActivityObligation`` per recipient. Recipients either just acknowledge
("acknowledge" mode) or must submit a workflow ("submit_workflow" mode).
Outstanding obligations are re-reminded on a cadence until done, stopping on
completion / max count / cutoff, with optional escalation to a supervisor.

The scheduler calls :func:`process_recurring_activities` (open due cycles) and
:func:`process_activity_reminders` (nag stragglers) each tick.
"""

from __future__ import annotations

import calendar
import logging
from datetime import date, datetime, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import (
    ActivityCycle,
    ActivityObligation,
    RecurringActivity,
    User,
    WorkflowInstance,
)
from app.services.notifications import notify_users
from app.services.user_groups import expand_user_ids

logger = logging.getLogger("wizflow.recurring")


# ── Recurrence math ─────────────────────────────────────────────────────────


def _tzinfo(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name or "UTC")
    except Exception:  # pragma: no cover - defensive against bad tz strings
        return ZoneInfo("UTC")


def _clamp_monthday(day: int, year: int, month: int) -> int:
    """Clamp a requested day-of-month to the last day of that month (e.g. 31 -> 28/29/30)."""
    last = calendar.monthrange(year, month)[1]
    return min(day, last)


def _months_between(a: date, b: date) -> int:
    return (b.year - a.year) * 12 + (b.month - a.month)


def activity_due_on(act: RecurringActivity, d: date) -> bool:
    """True if the activity's recurrence lands on calendar date ``d``.

    Intervals are anchored to ``start_date``: e.g. a quarterly (interval=3)
    monthly activity started in January lands Jan/Apr/Jul/Oct.
    """
    if d < act.start_date:
        return False
    if act.end_date and d > act.end_date:
        return False
    interval = max(1, act.interval or 1)

    if act.freq == "weekly":
        if act.by_weekday is None or d.weekday() != act.by_weekday:
            return False
        weeks = (d - act.start_date).days // 7
        return weeks >= 0 and weeks % interval == 0

    if act.freq == "monthly":
        if not act.by_monthday:
            return False
        if d.day != _clamp_monthday(act.by_monthday, d.year, d.month):
            return False
        months = _months_between(act.start_date, d)
        return months >= 0 and months % interval == 0

    if act.freq == "yearly":
        if not act.by_month or not act.by_monthday:
            return False
        if d.month != act.by_month:
            return False
        if d.day != _clamp_monthday(act.by_monthday, d.year, d.month):
            return False
        years = d.year - act.start_date.year
        return years >= 0 and years % interval == 0

    return False


def _period_label(act: RecurringActivity, d: date) -> str:
    if act.freq == "monthly":
        return d.strftime("%b %Y")
    if act.freq == "yearly":
        return d.strftime("%Y")
    return d.isoformat()


def _form_url(act: RecurringActivity) -> str:
    return f"{settings.app_url}/submit?wf={act.workflow_definition_id}"


# ── Firing: open due cycles + obligations ───────────────────────────────────


def _recipient_ids(db: Session, act: RecurringActivity) -> list[UUID]:
    return expand_user_ids(
        db,
        act.company_id,
        user_ids=[UUID(str(x)) for x in (act.recipient_user_ids or [])],
        group_ids=[UUID(str(x)) for x in (act.recipient_group_ids or [])],
    )


def _send_initial(db: Session, act: RecurringActivity, due_date: date, user_ids: list[UUID]) -> None:
    if act.completion_mode == "submit_workflow" and act.workflow_definition_id:
        title = f"Action required: {act.name}"
        body = (
            f"{act.description or act.name}\n\n"
            f"Please submit by {due_date.isoformat()}:\n{_form_url(act)}"
        )
    else:
        title = f"Reminder: {act.name}"
        body = act.description or f"Please complete: {act.name}"
    notify_users(
        db,
        company_id=act.company_id,
        user_ids=user_ids,
        title=title,
        body=body,
        send_email=True,
        send_push=True,
    )


def open_cycle(db: Session, act: RecurringActivity, due_date: date) -> ActivityCycle:
    """Create a cycle + one obligation per recipient and send the initial notification."""
    cycle = ActivityCycle(
        company_id=act.company_id,
        activity_id=act.id,
        due_date=due_date,
        period_label=_period_label(act, due_date),
    )
    db.add(cycle)
    db.flush()

    created: list[UUID] = []
    for uid in _recipient_ids(db, act):
        db.add(
            ActivityObligation(
                company_id=act.company_id,
                activity_id=act.id,
                cycle_id=cycle.id,
                user_id=uid,
                status="outstanding",
            )
        )
        created.append(uid)

    if created:
        db.flush()
        _send_initial(db, act, due_date, created)
    return cycle


def process_recurring_activities(db: Session, *, company_id: UUID | None = None) -> int:
    """Open a cycle for every active activity that is due today (local) and not yet opened."""
    now = datetime.now(timezone.utc)
    q = select(RecurringActivity).where(RecurringActivity.is_active.is_(True))
    if company_id:
        q = q.where(RecurringActivity.company_id == company_id)

    opened = 0
    for act in db.scalars(q):
        local = now.astimezone(_tzinfo(act.timezone))
        today = local.date()
        if local.hour < act.at_hour:
            continue
        if not activity_due_on(act, today):
            continue
        existing = db.scalar(
            select(ActivityCycle).where(
                ActivityCycle.activity_id == act.id,
                ActivityCycle.due_date == today,
            )
        )
        if existing:
            continue
        try:
            open_cycle(db, act, today)
            act.last_run_at = now
            opened += 1
        except Exception as e:  # pragma: no cover - keep other activities alive
            logger.warning("Failed to open cycle for activity %s: %s", act.id, e)
    db.commit()
    return opened


# ── Nagging + escalation ────────────────────────────────────────────────────


def _nag_body(act: RecurringActivity, due_date: date) -> str:
    if act.completion_mode == "submit_workflow" and act.workflow_definition_id:
        return (
            f"Still outstanding: {act.name} (due {due_date.isoformat()}).\n\n"
            f"Submit here:\n{_form_url(act)}"
        )
    return f"Still outstanding: {act.name} (due {due_date.isoformat()}). Please mark it done once handled."


def process_activity_reminders(db: Session, *, company_id: UUID | None = None) -> int:
    """Re-remind recipients with outstanding obligations; escalate to supervisor past threshold."""
    now = datetime.now(timezone.utc)
    q = select(RecurringActivity).where(
        RecurringActivity.is_active.is_(True),
        RecurringActivity.remind_enabled.is_(True),
    )
    if company_id:
        q = q.where(RecurringActivity.company_id == company_id)

    sent = 0
    for act in db.scalars(q):
        tz = _tzinfo(act.timezone)
        local = now.astimezone(tz)
        today = local.date()
        if local.hour < act.at_hour:
            continue
        interval = max(1, act.remind_interval_days or 1)

        obligations = db.scalars(
            select(ActivityObligation).where(
                ActivityObligation.activity_id == act.id,
                ActivityObligation.status == "outstanding",
            )
        )
        for ob in obligations:
            cycle = db.get(ActivityCycle, ob.cycle_id)
            if not cycle:
                continue
            days_since_due = (today - cycle.due_date).days
            # Nag only after the due date, on the cadence (daily -> every day; N -> every Nth day).
            if days_since_due < 1 or days_since_due % interval != 0:
                continue
            # Stop conditions: max count / cutoff window.
            if act.remind_max_count is not None and ob.reminder_count >= act.remind_max_count:
                continue
            if act.remind_window_days is not None and days_since_due > act.remind_window_days:
                continue
            # One nag per local day.
            if ob.last_reminded_at is not None and ob.last_reminded_at.astimezone(tz).date() >= today:
                continue

            notify_users(
                db,
                company_id=act.company_id,
                user_ids=[ob.user_id],
                title=f"Reminder: {act.name}",
                body=_nag_body(act, cycle.due_date),
                send_email=True,
                send_push=True,
            )
            ob.reminder_count += 1
            ob.last_reminded_at = now
            sent += 1

            # Escalate to supervisor once, after the configured number of nags.
            if (
                act.escalate_after_count is not None
                and act.supervisor_user_id
                and ob.escalated_at is None
                and ob.reminder_count >= act.escalate_after_count
            ):
                who = db.get(User, ob.user_id)
                notify_users(
                    db,
                    company_id=act.company_id,
                    user_ids=[act.supervisor_user_id],
                    title=f"Escalation: {act.name} overdue",
                    body=(
                        f"{who.full_name if who else 'A recipient'} has not completed "
                        f"'{act.name}' (due {cycle.due_date.isoformat()}, "
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
    """Mark outstanding submit_workflow obligations done when their owner submits the workflow.

    Matches by (originator, workflow_definition). Called from the submit endpoint;
    does not commit (the caller owns the transaction).
    """
    if not instance.workflow_definition_id or not instance.originator_user_id:
        return 0
    rows = db.scalars(
        select(ActivityObligation)
        .join(RecurringActivity, RecurringActivity.id == ActivityObligation.activity_id)
        .where(
            ActivityObligation.user_id == instance.originator_user_id,
            ActivityObligation.status == "outstanding",
            RecurringActivity.completion_mode == "submit_workflow",
            RecurringActivity.workflow_definition_id == instance.workflow_definition_id,
        )
    )
    n = 0
    for ob in rows:
        ob.status = "submitted"
        ob.completed_at = datetime.now(timezone.utc)
        ob.instance_id = instance.id
        n += 1
    return n


def acknowledge_obligation(db: Session, obligation_id: UUID, user_id: UUID) -> ActivityObligation | None:
    """Recipient marks their own (acknowledge-mode) obligation done."""
    ob = db.get(ActivityObligation, obligation_id)
    if not ob or ob.user_id != user_id:
        return None
    if ob.status == "outstanding":
        ob.status = "submitted"
        ob.completed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(ob)
    return ob
