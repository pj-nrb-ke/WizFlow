"""Per-step and workflow-level SLA helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import WorkflowDefinition, WorkflowEvent, WorkflowInstance
from app.services.analytics import DEFAULT_SLA_HOURS, sla_hours_from_settings


def step_sla_hours(step: dict, workflow_settings: dict | None) -> int:
    raw = step.get("sla_hours")
    if raw is not None:
        try:
            return max(1, int(raw))
        except (TypeError, ValueError):
            pass
    return sla_hours_from_settings(workflow_settings)


def find_step(defn: WorkflowDefinition | None, step_id: str | None) -> dict | None:
    if not defn or not step_id:
        return None
    for s in defn.steps or []:
        if str(s.get("id")) == str(step_id):
            return s
    return None


def step_started_at(
    db: Session,
    *,
    company_id: UUID,
    instance_id: UUID,
    step_id: str,
) -> datetime | None:
    events = list(
        db.scalars(
            select(WorkflowEvent)
            .where(
                WorkflowEvent.company_id == company_id,
                WorkflowEvent.instance_id == instance_id,
                WorkflowEvent.event_type == "step.started",
            )
            .order_by(WorkflowEvent.created_at.desc())
        )
    )
    for e in events:
        if (e.payload or {}).get("step_id") == step_id:
            return e.created_at
    return None


def effective_sla_hours(
    db: Session,
    inst: WorkflowInstance,
    defn: WorkflowDefinition | None,
) -> int:
    if not inst.current_step_id or not defn:
        return sla_hours_from_settings(defn.settings if defn else None)
    step = find_step(defn, inst.current_step_id)
    if step:
        return step_sla_hours(step, defn.settings or {})
    return sla_hours_from_settings(defn.settings if defn else None)


def step_deadline(
    db: Session,
    inst: WorkflowInstance,
    defn: WorkflowDefinition | None,
    *,
    now: datetime | None = None,
) -> datetime | None:
    if inst.status != "in_progress" or not inst.current_step_id:
        if inst.submitted_at and defn:
            hours = sla_hours_from_settings(defn.settings)
            return inst.submitted_at + timedelta(hours=hours)
        return None
    started = step_started_at(
        db,
        company_id=inst.company_id,
        instance_id=inst.id,
        step_id=inst.current_step_id,
    ) or inst.submitted_at
    if not started:
        return None
    hours = effective_sla_hours(db, inst, defn)
    return started + timedelta(hours=hours)


def is_step_overdue(
    db: Session,
    inst: WorkflowInstance,
    defn: WorkflowDefinition | None,
    *,
    now: datetime | None = None,
) -> bool:
    now = now or datetime.now(timezone.utc)
    deadline = step_deadline(db, inst, defn, now=now)
    return bool(deadline and now > deadline)


def is_step_at_risk(
    db: Session,
    inst: WorkflowInstance,
    defn: WorkflowDefinition | None,
    *,
    threshold: float = 0.8,
    now: datetime | None = None,
) -> bool:
    """True when past threshold of SLA time but not yet overdue."""
    now = now or datetime.now(timezone.utc)
    if inst.status != "in_progress" or not inst.current_step_id:
        return False
    started = step_started_at(
        db,
        company_id=inst.company_id,
        instance_id=inst.id,
        step_id=inst.current_step_id,
    ) or inst.submitted_at
    if not started:
        return False
    hours = effective_sla_hours(db, inst, defn)
    elapsed = (now - started).total_seconds() / 3600.0
    return threshold * hours <= elapsed < hours
