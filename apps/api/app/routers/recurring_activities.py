"""Recurring activities: general recurring reminders / obligations.

Management (admin/manager): CRUD + compliance report. Recipients: view and
acknowledge their own obligations. The scheduler opens cycles and sends nags;
``/run-now`` lets an admin open today's cycle immediately (demo / catch-up).
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company, require_roles
from app.db.models import (
    ActivityCycle,
    ActivityObligation,
    RecurringActivity,
    User,
    WorkflowDefinition,
)
from app.db.session import get_db
from app.schemas.recurring import (
    ComplianceSummaryOut,
    CycleOption,
    ObligationOut,
    RecurringActivityCreate,
    RecurringActivityOut,
    RecurringActivityUpdate,
)
from app.services.recurring_activities import acknowledge_obligation, activity_due_on, open_cycle

router = APIRouter(prefix="/recurring-activities", tags=["Recurring Activities"])
ADMIN_ROLES = ("company_admin", "manager")

_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_MONTHS = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
_FREQS = {"weekly", "monthly", "yearly"}
_MODES = {"acknowledge", "submit_workflow"}


def _ordinal(n: int) -> str:
    if 10 <= n % 100 <= 20:
        suf = "th"
    else:
        suf = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suf}"


def _schedule_summary(act: RecurringActivity) -> str:
    every = "every" if (act.interval or 1) == 1 else f"every {act.interval}"
    at = f"at {act.at_hour:02d}:00"
    if act.freq == "weekly":
        day = _WEEKDAYS[act.by_weekday] if act.by_weekday is not None and 0 <= act.by_weekday <= 6 else "?"
        unit = "week" if (act.interval or 1) == 1 else "weeks"
        return f"Every {act.interval if act.interval > 1 else ''} {unit} on {day} {at}".replace("  ", " ")
    if act.freq == "monthly":
        day = _ordinal(act.by_monthday) if act.by_monthday else "?"
        unit = "month" if (act.interval or 1) == 1 else f"{act.interval} months"
        return f"Every {unit} on the {day} {at}"
    if act.freq == "yearly":
        mon = _MONTHS[act.by_month] if act.by_month and 1 <= act.by_month <= 12 else "?"
        day = _ordinal(act.by_monthday) if act.by_monthday else "?"
        unit = "year" if (act.interval or 1) == 1 else f"{act.interval} years"
        return f"Every {unit} on {mon} {day} {at}"
    return every


def _out(db: Session, act: RecurringActivity) -> RecurringActivityOut:
    wf_name = None
    if act.workflow_definition_id:
        defn = db.get(WorkflowDefinition, act.workflow_definition_id)
        wf_name = defn.name if defn else None
    return RecurringActivityOut(
        id=act.id,
        name=act.name,
        description=act.description,
        freq=act.freq,
        interval=act.interval,
        by_weekday=act.by_weekday,
        by_monthday=act.by_monthday,
        by_month=act.by_month,
        at_hour=act.at_hour,
        timezone=act.timezone,
        start_date=act.start_date,
        end_date=act.end_date,
        completion_mode=act.completion_mode,
        workflow_definition_id=act.workflow_definition_id,
        workflow_name=wf_name,
        recipient_user_ids=[UUID(str(x)) for x in (act.recipient_user_ids or [])],
        recipient_group_ids=[UUID(str(x)) for x in (act.recipient_group_ids or [])],
        remind_enabled=act.remind_enabled,
        remind_interval_days=act.remind_interval_days,
        remind_max_count=act.remind_max_count,
        remind_window_days=act.remind_window_days,
        escalate_after_count=act.escalate_after_count,
        supervisor_user_id=act.supervisor_user_id,
        is_active=act.is_active,
        last_run_at=act.last_run_at,
        created_at=act.created_at,
        schedule_summary=_schedule_summary(act),
    )


def _validate_recurrence(
    *, freq: str, by_weekday: int | None, by_monthday: int | None, by_month: int | None
) -> None:
    if freq not in _FREQS:
        raise HTTPException(status_code=400, detail=f"freq must be one of {sorted(_FREQS)}")
    if freq == "weekly" and (by_weekday is None or not 0 <= by_weekday <= 6):
        raise HTTPException(status_code=400, detail="weekly recurrence needs by_weekday 0-6 (0=Mon)")
    if freq in ("monthly", "yearly") and (by_monthday is None or not 1 <= by_monthday <= 31):
        raise HTTPException(status_code=400, detail="monthly/yearly recurrence needs by_monthday 1-31")
    if freq == "yearly" and (by_month is None or not 1 <= by_month <= 12):
        raise HTTPException(status_code=400, detail="yearly recurrence needs by_month 1-12")


def _validate_mode(db: Session, company_id: UUID, mode: str, wf_id: UUID | None) -> None:
    if mode not in _MODES:
        raise HTTPException(status_code=400, detail=f"completion_mode must be one of {sorted(_MODES)}")
    if mode == "submit_workflow":
        if not wf_id:
            raise HTTPException(status_code=400, detail="submit_workflow mode needs workflow_definition_id")
        defn = db.get(WorkflowDefinition, wf_id)
        if not defn or defn.company_id != company_id:
            raise HTTPException(status_code=404, detail="Workflow not found")


# ── Management (admin / manager) ────────────────────────────────────────────


@router.get("", response_model=list[RecurringActivityOut])
def list_activities(
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> list[RecurringActivityOut]:
    rows = db.scalars(
        select(RecurringActivity)
        .where(RecurringActivity.company_id == user.company_id)
        .order_by(RecurringActivity.created_at.desc())
    )
    return [_out(db, a) for a in rows]


@router.post("", response_model=RecurringActivityOut, status_code=status.HTTP_201_CREATED)
def create_activity(
    body: RecurringActivityCreate,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> RecurringActivityOut:
    _validate_recurrence(
        freq=body.freq, by_weekday=body.by_weekday, by_monthday=body.by_monthday, by_month=body.by_month
    )
    _validate_mode(db, user.company_id, body.completion_mode, body.workflow_definition_id)
    act = RecurringActivity(
        company_id=user.company_id,
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        freq=body.freq,
        interval=max(1, body.interval),
        by_weekday=body.by_weekday,
        by_monthday=body.by_monthday,
        by_month=body.by_month,
        at_hour=max(0, min(23, body.at_hour)),
        timezone=body.timezone or "UTC",
        start_date=body.start_date,
        end_date=body.end_date,
        completion_mode=body.completion_mode,
        workflow_definition_id=body.workflow_definition_id,
        recipient_user_ids=[str(x) for x in body.recipient_user_ids],
        recipient_group_ids=[str(x) for x in body.recipient_group_ids],
        remind_enabled=body.remind_enabled,
        remind_interval_days=max(1, body.remind_interval_days),
        remind_max_count=body.remind_max_count,
        remind_window_days=body.remind_window_days,
        escalate_after_count=body.escalate_after_count,
        supervisor_user_id=body.supervisor_user_id,
        created_by=user.id,
    )
    db.add(act)
    db.commit()
    db.refresh(act)
    return _out(db, act)


def _get_owned(db: Session, activity_id: UUID, company_id: UUID) -> RecurringActivity:
    act = db.get(RecurringActivity, activity_id)
    if not act or act.company_id != company_id:
        raise HTTPException(status_code=404, detail="Not found")
    return act


@router.get("/{activity_id}", response_model=RecurringActivityOut)
def get_activity(
    activity_id: UUID,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> RecurringActivityOut:
    return _out(db, _get_owned(db, activity_id, user.company_id))


@router.patch("/{activity_id}", response_model=RecurringActivityOut)
def update_activity(
    activity_id: UUID,
    body: RecurringActivityUpdate,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> RecurringActivityOut:
    act = _get_owned(db, activity_id, user.company_id)
    data = body.model_dump(exclude_unset=True)

    freq = data.get("freq", act.freq)
    by_weekday = data.get("by_weekday", act.by_weekday)
    by_monthday = data.get("by_monthday", act.by_monthday)
    by_month = data.get("by_month", act.by_month)
    if any(k in data for k in ("freq", "by_weekday", "by_monthday", "by_month")):
        _validate_recurrence(freq=freq, by_weekday=by_weekday, by_monthday=by_monthday, by_month=by_month)

    mode = data.get("completion_mode", act.completion_mode)
    wf_id = data.get("workflow_definition_id", act.workflow_definition_id)
    if "completion_mode" in data or "workflow_definition_id" in data:
        _validate_mode(db, user.company_id, mode, wf_id)

    simple = {
        "name", "description", "freq", "interval", "by_weekday", "by_monthday", "by_month",
        "at_hour", "timezone", "start_date", "end_date", "completion_mode", "workflow_definition_id",
        "remind_enabled", "remind_interval_days", "remind_max_count", "remind_window_days",
        "escalate_after_count", "supervisor_user_id", "is_active",
    }
    for key in simple & data.keys():
        val = data[key]
        if key == "at_hour" and val is not None:
            val = max(0, min(23, val))
        if key in ("interval", "remind_interval_days") and val is not None:
            val = max(1, val)
        if key == "name" and val is not None:
            val = val.strip()
        setattr(act, key, val)
    if "recipient_user_ids" in data and data["recipient_user_ids"] is not None:
        act.recipient_user_ids = [str(x) for x in data["recipient_user_ids"]]
    if "recipient_group_ids" in data and data["recipient_group_ids"] is not None:
        act.recipient_group_ids = [str(x) for x in data["recipient_group_ids"]]

    db.commit()
    db.refresh(act)
    return _out(db, act)


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activity(
    activity_id: UUID,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> None:
    act = _get_owned(db, activity_id, user.company_id)
    db.delete(act)
    db.commit()


@router.post("/{activity_id}/run-now", response_model=ComplianceSummaryOut)
def run_now(
    activity_id: UUID,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> ComplianceSummaryOut:
    """Open today's cycle immediately (idempotent) — for demo / catch-up."""
    act = _get_owned(db, activity_id, user.company_id)
    today = datetime.now(timezone.utc).date()
    existing = db.scalar(
        select(ActivityCycle).where(
            ActivityCycle.activity_id == act.id, ActivityCycle.due_date == today
        )
    )
    if not existing:
        open_cycle(db, act, today)
        act.last_run_at = datetime.now(timezone.utc)
        db.commit()
    return _compliance(db, act, cycle_id=None)


# ── Compliance report ───────────────────────────────────────────────────────


def _obligation_out(db: Session, ob: ActivityObligation, act: RecurringActivity, cycle: ActivityCycle) -> ObligationOut:
    u = db.get(User, ob.user_id)
    return ObligationOut(
        id=ob.id,
        activity_id=act.id,
        activity_name=act.name,
        cycle_id=cycle.id,
        due_date=cycle.due_date,
        period_label=cycle.period_label,
        user_id=ob.user_id,
        user_name=u.full_name if u else "",
        status=ob.status,
        completed_at=ob.completed_at,
        reminder_count=ob.reminder_count,
        escalated_at=ob.escalated_at,
        completion_mode=act.completion_mode,
        workflow_definition_id=act.workflow_definition_id,
    )


def _compliance(db: Session, act: RecurringActivity, cycle_id: UUID | None) -> ComplianceSummaryOut:
    cycles = list(
        db.scalars(
            select(ActivityCycle)
            .where(ActivityCycle.activity_id == act.id)
            .order_by(ActivityCycle.due_date.desc())
        )
    )
    options = [CycleOption(id=c.id, due_date=c.due_date, period_label=c.period_label) for c in cycles]

    target = None
    if cycle_id:
        target = next((c for c in cycles if c.id == cycle_id), None)
    elif cycles:
        target = cycles[0]

    rows: list[ObligationOut] = []
    submitted = outstanding = 0
    if target:
        obs = db.scalars(
            select(ActivityObligation)
            .where(ActivityObligation.cycle_id == target.id)
            .order_by(ActivityObligation.status.desc())
        )
        for ob in obs:
            rows.append(_obligation_out(db, ob, act, target))
            if ob.status == "submitted":
                submitted += 1
            else:
                outstanding += 1

    total = submitted + outstanding
    pct = round((submitted / total) * 100, 1) if total else 0.0
    return ComplianceSummaryOut(
        activity_id=act.id,
        activity_name=act.name,
        cycle_id=target.id if target else None,
        due_date=target.due_date if target else None,
        period_label=target.period_label if target else "",
        total=total,
        submitted=submitted,
        outstanding=outstanding,
        compliance_pct=pct,
        rows=rows,
        cycles=options,
    )


@router.get("/{activity_id}/compliance", response_model=ComplianceSummaryOut)
def compliance(
    activity_id: UUID,
    cycle_id: UUID | None = Query(None),
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> ComplianceSummaryOut:
    act = _get_owned(db, activity_id, user.company_id)
    return _compliance(db, act, cycle_id)


@router.get("/{activity_id}/compliance/export.csv")
def export_compliance_csv(
    activity_id: UUID,
    cycle_id: UUID | None = Query(None),
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    act = _get_owned(db, activity_id, user.company_id)
    summary = _compliance(db, act, cycle_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Activity", "Period", "Due Date", "Recipient", "Status", "Reminders", "Completed At"])
    for r in summary.rows:
        writer.writerow([
            r.activity_name,
            r.period_label,
            r.due_date.isoformat(),
            r.user_name,
            r.status,
            r.reminder_count,
            r.completed_at.isoformat() if r.completed_at else "",
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=activity-compliance.csv"},
    )


# ── Recipient endpoints (any authenticated user) ────────────────────────────


@router.get("/mine/obligations", response_model=list[ObligationOut])
def my_obligations(
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[ObligationOut]:
    rows = db.scalars(
        select(ActivityObligation)
        .where(
            ActivityObligation.company_id == user.company_id,
            ActivityObligation.user_id == user.id,
        )
        .order_by(ActivityObligation.created_at.desc())
        .limit(100)
    )
    out: list[ObligationOut] = []
    for ob in rows:
        act = db.get(RecurringActivity, ob.activity_id)
        cycle = db.get(ActivityCycle, ob.cycle_id)
        if act and cycle:
            out.append(_obligation_out(db, ob, act, cycle))
    return out


@router.post("/obligations/{obligation_id}/acknowledge", response_model=ObligationOut)
def acknowledge(
    obligation_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> ObligationOut:
    ob = acknowledge_obligation(db, obligation_id, user.id)
    if not ob:
        raise HTTPException(status_code=404, detail="Not found or not yours")
    act = db.get(RecurringActivity, ob.activity_id)
    cycle = db.get(ActivityCycle, ob.cycle_id)
    return _obligation_out(db, ob, act, cycle)
