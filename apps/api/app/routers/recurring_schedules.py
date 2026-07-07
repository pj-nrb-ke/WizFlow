"""Recurring schedules: reusable calendar rules driving many targets.

A schedule is the pure "WHEN"; each target attaches a "WHAT" (a workflow to
submit, an acknowledge task, or a checklist to reopen) with its own recipients
and reminder/escalation config. Management (admin/manager): CRUD schedules +
targets and per-target compliance reports. Recipients: view and acknowledge
their own obligations. The scheduler opens runs and sends nags; ``/run-now``
lets an admin open today's runs immediately (demo / catch-up).
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company, require_roles
from app.db.models import (
    Checklist,
    RecurringSchedule,
    ScheduleObligation,
    ScheduleRun,
    ScheduleTarget,
    User,
    WorkflowDefinition,
)
from app.db.session import get_db
from app.schemas.recurring import (
    ComplianceSummaryOut,
    ObligationOut,
    RunOption,
    ScheduleCreate,
    ScheduleOut,
    ScheduleUpdate,
    TargetCreate,
    TargetOut,
    TargetUpdate,
)
from app.services.recurring_schedules import acknowledge_obligation, run_due_targets

router = APIRouter(prefix="/recurring-schedules", tags=["Recurring Schedules"])
ADMIN_ROLES = ("company_admin", "manager")

_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_MONTHS = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
_FREQS = {"weekly", "monthly", "yearly"}
_KINDS = {"workflow", "acknowledge", "checklist"}


# ── Presentation helpers ─────────────────────────────────────────────────────


def _ordinal(n: int) -> str:
    if 10 <= n % 100 <= 20:
        suf = "th"
    else:
        suf = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suf}"


def _schedule_summary(sched: RecurringSchedule) -> str:
    every = "every" if (sched.interval or 1) == 1 else f"every {sched.interval}"
    at = f"at {sched.at_hour:02d}:00"
    if sched.freq == "weekly":
        day = _WEEKDAYS[sched.by_weekday] if sched.by_weekday is not None and 0 <= sched.by_weekday <= 6 else "?"
        unit = "week" if (sched.interval or 1) == 1 else "weeks"
        return f"Every {sched.interval if sched.interval > 1 else ''} {unit} on {day} {at}".replace("  ", " ")
    if sched.freq == "monthly":
        day = _ordinal(sched.by_monthday) if sched.by_monthday else "?"
        unit = "month" if (sched.interval or 1) == 1 else f"{sched.interval} months"
        return f"Every {unit} on the {day} {at}"
    if sched.freq == "yearly":
        mon = _MONTHS[sched.by_month] if sched.by_month and 1 <= sched.by_month <= 12 else "?"
        day = _ordinal(sched.by_monthday) if sched.by_monthday else "?"
        unit = "year" if (sched.interval or 1) == 1 else f"{sched.interval} years"
        return f"Every {unit} on {mon} {day} {at}"
    return every


def _resolve_target_name(db: Session, target: ScheduleTarget) -> str:
    """Human label for a target: its explicit name, else the workflow/checklist name."""
    if (target.name or "").strip():
        return target.name.strip()
    if target.kind == "workflow" and target.workflow_definition_id:
        defn = db.get(WorkflowDefinition, target.workflow_definition_id)
        return defn.name if defn else "Workflow"
    if target.kind == "checklist" and target.checklist_id:
        cl = db.get(Checklist, target.checklist_id)
        return cl.name if cl else "Checklist"
    return "Acknowledge"


def _target_out(db: Session, target: ScheduleTarget) -> TargetOut:
    return TargetOut(
        id=target.id,
        schedule_id=target.schedule_id,
        kind=target.kind,
        name=target.name,
        target_name=_resolve_target_name(db, target),
        workflow_definition_id=target.workflow_definition_id,
        checklist_id=target.checklist_id,
        recipient_user_ids=[UUID(str(x)) for x in (target.recipient_user_ids or [])],
        recipient_group_ids=[UUID(str(x)) for x in (target.recipient_group_ids or [])],
        remind_enabled=target.remind_enabled,
        remind_interval_days=target.remind_interval_days,
        remind_max_count=target.remind_max_count,
        remind_window_days=target.remind_window_days,
        escalate_after_count=target.escalate_after_count,
        supervisor_user_id=target.supervisor_user_id,
        is_active=target.is_active,
        created_at=target.created_at,
    )


def _schedule_targets(db: Session, schedule_id: UUID) -> list[ScheduleTarget]:
    return list(
        db.scalars(
            select(ScheduleTarget)
            .where(ScheduleTarget.schedule_id == schedule_id)
            .order_by(ScheduleTarget.created_at)
        )
    )


def _schedule_out(db: Session, sched: RecurringSchedule) -> ScheduleOut:
    return ScheduleOut(
        id=sched.id,
        name=sched.name,
        description=sched.description,
        freq=sched.freq,
        interval=sched.interval,
        by_weekday=sched.by_weekday,
        by_monthday=sched.by_monthday,
        by_month=sched.by_month,
        at_hour=sched.at_hour,
        timezone=sched.timezone,
        start_date=sched.start_date,
        end_date=sched.end_date,
        is_active=sched.is_active,
        last_run_at=sched.last_run_at,
        created_at=sched.created_at,
        schedule_summary=_schedule_summary(sched),
        targets=[_target_out(db, t) for t in _schedule_targets(db, sched.id)],
    )


def _obligation_out(
    db: Session, ob: ScheduleObligation, sched: RecurringSchedule, target: ScheduleTarget, run: ScheduleRun
) -> ObligationOut:
    u = db.get(User, ob.user_id)
    return ObligationOut(
        id=ob.id,
        schedule_id=sched.id,
        schedule_name=sched.name,
        target_id=target.id,
        run_id=run.id,
        due_date=run.due_date,
        period_label=run.period_label,
        user_id=ob.user_id,
        user_name=u.full_name if u else "",
        status=ob.status,
        completed_at=ob.completed_at,
        reminder_count=ob.reminder_count,
        escalated_at=ob.escalated_at,
        completion_mode="submit_workflow" if target.kind == "workflow" else "acknowledge",
        workflow_definition_id=target.workflow_definition_id,
    )


# ── Validation ───────────────────────────────────────────────────────────────


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


def _validate_target(
    db: Session, company_id: UUID, kind: str, wf_id: UUID | None, checklist_id: UUID | None
) -> None:
    if kind not in _KINDS:
        raise HTTPException(status_code=400, detail=f"kind must be one of {sorted(_KINDS)}")
    if kind == "workflow":
        if not wf_id:
            raise HTTPException(status_code=400, detail="workflow target needs workflow_definition_id")
        defn = db.get(WorkflowDefinition, wf_id)
        if not defn or defn.company_id != company_id:
            raise HTTPException(status_code=404, detail="Workflow not found")
    elif kind == "checklist":
        if not checklist_id:
            raise HTTPException(status_code=400, detail="checklist target needs checklist_id")
        cl = db.get(Checklist, checklist_id)
        if not cl or cl.company_id != company_id:
            raise HTTPException(status_code=404, detail="Checklist not found")
    # acknowledge needs neither a workflow nor a checklist


def _get_owned(db: Session, schedule_id: UUID, company_id: UUID) -> RecurringSchedule:
    sched = db.get(RecurringSchedule, schedule_id)
    if not sched or sched.company_id != company_id:
        raise HTTPException(status_code=404, detail="Not found")
    return sched


def _get_owned_target(db: Session, target_id: UUID, company_id: UUID) -> ScheduleTarget:
    target = db.get(ScheduleTarget, target_id)
    if not target or target.company_id != company_id:
        raise HTTPException(status_code=404, detail="Not found")
    return target


# ── Compliance report (per target) ───────────────────────────────────────────


def _compliance(
    db: Session, target: ScheduleTarget, sched: RecurringSchedule, run_id: UUID | None
) -> ComplianceSummaryOut:
    runs = list(
        db.scalars(
            select(ScheduleRun)
            .where(ScheduleRun.target_id == target.id)
            .order_by(ScheduleRun.due_date.desc())
        )
    )
    options = [RunOption(id=r.id, due_date=r.due_date, period_label=r.period_label) for r in runs]

    target_run = None
    if run_id:
        target_run = next((r for r in runs if r.id == run_id), None)
    elif runs:
        target_run = runs[0]

    rows: list[ObligationOut] = []
    submitted = outstanding = 0
    if target_run:
        obs = db.scalars(
            select(ScheduleObligation)
            .where(ScheduleObligation.run_id == target_run.id)
            .order_by(ScheduleObligation.status.desc())
        )
        for ob in obs:
            rows.append(_obligation_out(db, ob, sched, target, target_run))
            if ob.status == "submitted":
                submitted += 1
            else:
                outstanding += 1

    total = submitted + outstanding
    pct = round((submitted / total) * 100, 1) if total else 0.0
    return ComplianceSummaryOut(
        target_id=target.id,
        target_name=_resolve_target_name(db, target),
        schedule_name=sched.name,
        run_id=target_run.id if target_run else None,
        due_date=target_run.due_date if target_run else None,
        period_label=target_run.period_label if target_run else "",
        total=total,
        submitted=submitted,
        outstanding=outstanding,
        compliance_pct=pct,
        rows=rows,
        runs=options,
    )


# ── Schedules (admin / manager) ──────────────────────────────────────────────


@router.get("", response_model=list[ScheduleOut])
def list_schedules(
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> list[ScheduleOut]:
    rows = db.scalars(
        select(RecurringSchedule)
        .where(RecurringSchedule.company_id == user.company_id)
        .order_by(RecurringSchedule.created_at.desc())
    )
    return [_schedule_out(db, s) for s in rows]


@router.post("", response_model=ScheduleOut, status_code=status.HTTP_201_CREATED)
def create_schedule(
    body: ScheduleCreate,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> ScheduleOut:
    _validate_recurrence(
        freq=body.freq, by_weekday=body.by_weekday, by_monthday=body.by_monthday, by_month=body.by_month
    )
    sched = RecurringSchedule(
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
        created_by=user.id,
    )
    db.add(sched)
    db.commit()
    db.refresh(sched)
    return _schedule_out(db, sched)


# ── Recipient endpoints (any authenticated user) — declared before /{id} ─────


@router.get("/mine/obligations", response_model=list[ObligationOut])
def my_obligations(
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[ObligationOut]:
    rows = db.scalars(
        select(ScheduleObligation)
        .where(
            ScheduleObligation.company_id == user.company_id,
            ScheduleObligation.user_id == user.id,
        )
        .order_by(ScheduleObligation.created_at.desc())
        .limit(100)
    )
    out: list[ObligationOut] = []
    for ob in rows:
        sched = db.get(RecurringSchedule, ob.schedule_id)
        target = db.get(ScheduleTarget, ob.target_id)
        run = db.get(ScheduleRun, ob.run_id)
        if sched and target and run:
            out.append(_obligation_out(db, ob, sched, target, run))
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
    sched = db.get(RecurringSchedule, ob.schedule_id)
    target = db.get(ScheduleTarget, ob.target_id)
    run = db.get(ScheduleRun, ob.run_id)
    return _obligation_out(db, ob, sched, target, run)


# ── Targets (admin / manager) — literal /targets prefix before /{id} ─────────


@router.get("/targets/{target_id}/compliance", response_model=ComplianceSummaryOut)
def target_compliance(
    target_id: UUID,
    run_id: UUID | None = Query(None),
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> ComplianceSummaryOut:
    target = _get_owned_target(db, target_id, user.company_id)
    sched = db.get(RecurringSchedule, target.schedule_id)
    return _compliance(db, target, sched, run_id)


@router.get("/targets/{target_id}/compliance/export.csv")
def export_target_compliance_csv(
    target_id: UUID,
    run_id: UUID | None = Query(None),
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    target = _get_owned_target(db, target_id, user.company_id)
    sched = db.get(RecurringSchedule, target.schedule_id)
    summary = _compliance(db, target, sched, run_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Schedule", "Target", "Period", "Due Date", "Recipient", "Status", "Reminders", "Completed At"])
    for r in summary.rows:
        writer.writerow([
            summary.schedule_name,
            summary.target_name,
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
        headers={"Content-Disposition": "attachment; filename=schedule-compliance.csv"},
    )


@router.patch("/targets/{target_id}", response_model=TargetOut)
def update_target(
    target_id: UUID,
    body: TargetUpdate,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> TargetOut:
    target = _get_owned_target(db, target_id, user.company_id)
    data = body.model_dump(exclude_unset=True)

    kind = data.get("kind", target.kind)
    wf_id = data.get("workflow_definition_id", target.workflow_definition_id)
    checklist_id = data.get("checklist_id", target.checklist_id)
    if any(k in data for k in ("kind", "workflow_definition_id", "checklist_id")):
        _validate_target(db, user.company_id, kind, wf_id, checklist_id)

    simple = {
        "kind", "name", "workflow_definition_id", "checklist_id", "remind_enabled",
        "remind_interval_days", "remind_max_count", "remind_window_days",
        "escalate_after_count", "supervisor_user_id", "is_active",
    }
    for key in simple & data.keys():
        val = data[key]
        if key == "remind_interval_days" and val is not None:
            val = max(1, val)
        if key == "name":
            val = (val.strip() or None) if isinstance(val, str) else None
        setattr(target, key, val)
    if "recipient_user_ids" in data and data["recipient_user_ids"] is not None:
        target.recipient_user_ids = [str(x) for x in data["recipient_user_ids"]]
    if "recipient_group_ids" in data and data["recipient_group_ids"] is not None:
        target.recipient_group_ids = [str(x) for x in data["recipient_group_ids"]]

    db.commit()
    db.refresh(target)
    return _target_out(db, target)


@router.delete("/targets/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_target(
    target_id: UUID,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> None:
    target = _get_owned_target(db, target_id, user.company_id)
    db.delete(target)
    db.commit()


# ── Single schedule (admin / manager) ────────────────────────────────────────


@router.get("/{schedule_id}", response_model=ScheduleOut)
def get_schedule(
    schedule_id: UUID,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> ScheduleOut:
    return _schedule_out(db, _get_owned(db, schedule_id, user.company_id))


@router.patch("/{schedule_id}", response_model=ScheduleOut)
def update_schedule(
    schedule_id: UUID,
    body: ScheduleUpdate,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> ScheduleOut:
    sched = _get_owned(db, schedule_id, user.company_id)
    data = body.model_dump(exclude_unset=True)

    freq = data.get("freq", sched.freq)
    by_weekday = data.get("by_weekday", sched.by_weekday)
    by_monthday = data.get("by_monthday", sched.by_monthday)
    by_month = data.get("by_month", sched.by_month)
    if any(k in data for k in ("freq", "by_weekday", "by_monthday", "by_month")):
        _validate_recurrence(freq=freq, by_weekday=by_weekday, by_monthday=by_monthday, by_month=by_month)

    simple = {
        "name", "description", "freq", "interval", "by_weekday", "by_monthday", "by_month",
        "at_hour", "timezone", "start_date", "end_date", "is_active",
    }
    for key in simple & data.keys():
        val = data[key]
        if key == "at_hour" and val is not None:
            val = max(0, min(23, val))
        if key == "interval" and val is not None:
            val = max(1, val)
        if key == "name" and val is not None:
            val = val.strip()
        if key == "description" and val is not None:
            val = val.strip() or None
        setattr(sched, key, val)

    db.commit()
    db.refresh(sched)
    return _schedule_out(db, sched)


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(
    schedule_id: UUID,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> None:
    sched = _get_owned(db, schedule_id, user.company_id)
    db.delete(sched)
    db.commit()


@router.post("/{schedule_id}/run-now", response_model=ScheduleOut)
def run_now(
    schedule_id: UUID,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> ScheduleOut:
    """Open today's runs for every active target immediately (idempotent) — demo / catch-up."""
    sched = _get_owned(db, schedule_id, user.company_id)
    today = datetime.now(timezone.utc).date()
    opened = run_due_targets(db, sched, today)
    if opened:
        sched.last_run_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(sched)
    return _schedule_out(db, sched)


@router.get("/{schedule_id}/targets", response_model=list[TargetOut])
def list_targets(
    schedule_id: UUID,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> list[TargetOut]:
    sched = _get_owned(db, schedule_id, user.company_id)
    return [_target_out(db, t) for t in _schedule_targets(db, sched.id)]


@router.post("/{schedule_id}/targets", response_model=TargetOut, status_code=status.HTTP_201_CREATED)
def add_target(
    schedule_id: UUID,
    body: TargetCreate,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> TargetOut:
    sched = _get_owned(db, schedule_id, user.company_id)
    _validate_target(db, user.company_id, body.kind, body.workflow_definition_id, body.checklist_id)
    target = ScheduleTarget(
        company_id=user.company_id,
        schedule_id=sched.id,
        kind=body.kind,
        name=(body.name or "").strip() or None,
        workflow_definition_id=body.workflow_definition_id if body.kind == "workflow" else None,
        checklist_id=body.checklist_id if body.kind == "checklist" else None,
        recipient_user_ids=[str(x) for x in body.recipient_user_ids],
        recipient_group_ids=[str(x) for x in body.recipient_group_ids],
        remind_enabled=body.remind_enabled,
        remind_interval_days=max(1, body.remind_interval_days),
        remind_max_count=body.remind_max_count,
        remind_window_days=body.remind_window_days,
        escalate_after_count=body.escalate_after_count,
        supervisor_user_id=body.supervisor_user_id,
    )
    db.add(target)
    db.commit()
    db.refresh(target)
    return _target_out(db, target)
