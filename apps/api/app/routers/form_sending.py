"""Feature 1: Send form to internal users.
   Feature 2: Scheduled form dispatch.
   Feature 8: Submission reports.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import CurrentUser, require_roles
from app.db.models import (
    GuestSubmission,
    User,
    WorkflowDefinition,
    WorkflowInstance,
    WorkflowSchedule,
)
from app.db.session import get_db
from app.services.brevo_mail import send_form_invitation_email

router = APIRouter(tags=["Form Sending"])

_MANAGER_ROLES = ("company_admin", "manager")


def _get_published_wf(db: Session, workflow_id: uuid.UUID, company_id: uuid.UUID) -> WorkflowDefinition:
    wf = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == workflow_id,
            WorkflowDefinition.company_id == company_id,
        )
    )
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found.")
    if wf.status != "published":
        raise HTTPException(status_code=400, detail="Only published workflows can be sent.")
    return wf


# ── Feature 1: Immediate send ────────────────────────────────────────────────

class SendFormBody(BaseModel):
    user_ids: list[str]


class SendFormOut(BaseModel):
    sent: int
    skipped: int


@router.post("/workflows/{workflow_id}/send-form", response_model=SendFormOut)
def send_form_now(
    workflow_id: uuid.UUID,
    body: SendFormBody,
    user: CurrentUser = Depends(require_roles(*_MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> SendFormOut:
    wf = _get_published_wf(db, workflow_id, user.company_id)
    sender_name = user.full_name or user.email

    from app.db.models import Company
    company = db.scalar(select(Company).where(Company.id == user.company_id))
    company_name = company.name if company else "WizFlow"

    form_url = f"{settings.app_url}/submit?wf={workflow_id}"
    sent = 0
    skipped = 0

    for uid_str in body.user_ids:
        try:
            uid = uuid.UUID(uid_str)
        except ValueError:
            skipped += 1
            continue
        recipient = db.scalar(
            select(User).where(User.id == uid, User.company_id == user.company_id)
        )
        if not recipient:
            skipped += 1
            continue
        ok = send_form_invitation_email(
            to_email=recipient.email,
            to_name=recipient.full_name or recipient.email,
            sender_name=sender_name,
            company_name=company_name,
            workflow_name=wf.name,
            form_url=form_url,
        )
        if ok:
            sent += 1
        else:
            skipped += 1

    return SendFormOut(sent=sent, skipped=skipped)


# ── Feature 2: Scheduled send ────────────────────────────────────────────────

class FormScheduleCreate(BaseModel):
    name: str
    frequency: str  # once | weekly | monthly
    recipient_user_ids: list[str]
    next_run_at: datetime | None = None  # required for frequency==once


class FormScheduleOut(BaseModel):
    id: str
    name: str
    frequency: str
    recipient_user_ids: list[str]
    is_active: bool
    last_run_at: datetime | None
    next_run_at: datetime | None
    created_at: datetime


def _to_schedule_out(s: WorkflowSchedule) -> FormScheduleOut:
    return FormScheduleOut(
        id=str(s.id),
        name=s.name,
        frequency=s.frequency,
        recipient_user_ids=[str(x) for x in (s.recipient_user_ids or [])],
        is_active=s.is_active,
        last_run_at=s.last_run_at,
        next_run_at=s.next_run_at,
        created_at=s.created_at,
    )


@router.get("/workflows/{workflow_id}/form-schedules", response_model=list[FormScheduleOut])
def list_form_schedules(
    workflow_id: uuid.UUID,
    user: CurrentUser = Depends(require_roles(*_MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> list[FormScheduleOut]:
    _get_published_wf(db, workflow_id, user.company_id)
    rows = db.scalars(
        select(WorkflowSchedule).where(
            WorkflowSchedule.workflow_definition_id == workflow_id,
            WorkflowSchedule.company_id == user.company_id,
            WorkflowSchedule.schedule_type == "send_form",
        ).order_by(WorkflowSchedule.created_at.desc())
    ).all()
    return [_to_schedule_out(r) for r in rows]


@router.post("/workflows/{workflow_id}/form-schedules", response_model=FormScheduleOut, status_code=201)
def create_form_schedule(
    workflow_id: uuid.UUID,
    body: FormScheduleCreate,
    user: CurrentUser = Depends(require_roles(*_MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> FormScheduleOut:
    _get_published_wf(db, workflow_id, user.company_id)

    valid_freqs = {"once", "weekly", "monthly"}
    if body.frequency not in valid_freqs:
        raise HTTPException(status_code=400, detail=f"frequency must be one of {sorted(valid_freqs)}")
    if body.frequency == "once" and not body.next_run_at:
        raise HTTPException(status_code=400, detail="next_run_at is required when frequency is 'once'.")
    if not body.recipient_user_ids:
        raise HTTPException(status_code=400, detail="At least one recipient is required.")

    sched = WorkflowSchedule(
        id=uuid.uuid4(),
        company_id=user.company_id,
        workflow_definition_id=workflow_id,
        name=body.name.strip()[:120],
        frequency=body.frequency,
        schedule_type="send_form",
        recipient_user_ids=[str(x) for x in body.recipient_user_ids],
        next_run_at=body.next_run_at,
        initiator_user_id=user.id,
        default_data={},
    )
    db.add(sched)
    db.commit()
    db.refresh(sched)
    return _to_schedule_out(sched)


@router.patch("/workflows/{workflow_id}/form-schedules/{sched_id}", response_model=FormScheduleOut)
def toggle_form_schedule(
    workflow_id: uuid.UUID,
    sched_id: uuid.UUID,
    user: CurrentUser = Depends(require_roles(*_MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> FormScheduleOut:
    sched = db.scalar(
        select(WorkflowSchedule).where(
            WorkflowSchedule.id == sched_id,
            WorkflowSchedule.company_id == user.company_id,
            WorkflowSchedule.schedule_type == "send_form",
        )
    )
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found.")
    sched.is_active = not sched.is_active
    db.commit()
    db.refresh(sched)
    return _to_schedule_out(sched)


@router.delete("/workflows/{workflow_id}/form-schedules/{sched_id}", status_code=204)
def delete_form_schedule(
    workflow_id: uuid.UUID,
    sched_id: uuid.UUID,
    user: CurrentUser = Depends(require_roles(*_MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> None:
    sched = db.scalar(
        select(WorkflowSchedule).where(
            WorkflowSchedule.id == sched_id,
            WorkflowSchedule.company_id == user.company_id,
            WorkflowSchedule.schedule_type == "send_form",
        )
    )
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found.")
    db.delete(sched)
    db.commit()


# ── Feature 8: Submission report ─────────────────────────────────────────────

class FieldAggregation(BaseModel):
    type: str
    options: list[dict] = []
    texts: list[str] = []
    min: float | None = None
    max: float | None = None
    avg: float | None = None
    count: int = 0


class FieldReport(BaseModel):
    key: str
    label: str
    field_type: str
    aggregation: FieldAggregation


class FormReport(BaseModel):
    workflow_id: str
    workflow_name: str
    total_responses: int
    internal_count: int
    guest_count: int
    first_submission: str | None
    last_submission: str | None
    fields: list[FieldReport]


def _agg_field(key: str, field_type: str, values: list[Any]) -> FieldAggregation:
    non_empty = [v for v in values if v is not None and v != "" and v is not False]

    if field_type in ("radio", "dropdown", "yes_no"):
        counts: dict[str, int] = {}
        for v in non_empty:
            sv = str(v)
            counts[sv] = counts.get(sv, 0) + 1
        total = sum(counts.values()) or 1
        options = sorted(
            [{"label": k, "count": v, "pct": round(v / total * 100, 1)} for k, v in counts.items()],
            key=lambda x: -x["count"],
        )
        return FieldAggregation(type="counts", options=options, count=len(non_empty))

    if field_type in ("number", "currency"):
        nums = []
        for v in non_empty:
            try:
                nums.append(float(v))
            except (TypeError, ValueError):
                pass
        if nums:
            return FieldAggregation(
                type="numeric",
                min=min(nums),
                max=max(nums),
                avg=round(sum(nums) / len(nums), 2),
                count=len(nums),
            )
        return FieldAggregation(type="numeric", count=0)

    if field_type in ("text", "textarea", "email"):
        texts = [str(v)[:200] for v in non_empty][:50]
        return FieldAggregation(type="texts", texts=texts, count=len(non_empty))

    if field_type == "checkbox":
        checked = sum(1 for v in values if v is True or v == "true" or v == 1)
        total = len(values)
        pct = round(checked / total * 100, 1) if total else 0.0
        return FieldAggregation(
            type="counts",
            options=[
                {"label": "Checked", "count": checked, "pct": pct},
                {"label": "Unchecked", "count": total - checked, "pct": round(100 - pct, 1)},
            ],
            count=total,
        )

    return FieldAggregation(type="raw", texts=[str(v)[:100] for v in non_empty][:20], count=len(non_empty))


@router.get("/workflows/{workflow_id}/form-report", response_model=FormReport)
def get_form_report(
    workflow_id: uuid.UUID,
    user: CurrentUser = Depends(require_roles(*_MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> FormReport:
    wf = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == workflow_id,
            WorkflowDefinition.company_id == user.company_id,
        )
    )
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found.")

    # Collect all internal submissions
    instances = db.scalars(
        select(WorkflowInstance).where(
            WorkflowInstance.workflow_definition_id == workflow_id,
            WorkflowInstance.company_id == user.company_id,
        )
    ).all()

    # Collect all guest submissions
    guests = db.scalars(
        select(GuestSubmission).where(
            GuestSubmission.workflow_definition_id == workflow_id,
            GuestSubmission.company_id == user.company_id,
        )
    ).all()

    internal_count = len(instances)
    guest_count = len(guests)
    total = internal_count + guest_count

    # Date range
    all_dates = (
        [i.submitted_at or i.created_at for i in instances if i.submitted_at or i.created_at]
        + [g.submitted_at for g in guests if g.submitted_at]
    )
    first_dt = min(all_dates).isoformat() if all_dates else None
    last_dt = max(all_dates).isoformat() if all_dates else None

    # Build per-field aggregations
    fields_def = (wf.form_schema or {}).get("fields", [])
    all_data = (
        [i.request_data or {} for i in instances]
        + [g.data or {} for g in guests]
    )

    field_reports: list[FieldReport] = []
    for fd in fields_def:
        key = fd.get("key", "")
        label = fd.get("label", key)
        ftype = fd.get("type", "text")
        if not key or key.startswith("__"):
            continue
        values = [row.get(key) for row in all_data]
        agg = _agg_field(key, ftype, values)
        field_reports.append(FieldReport(key=key, label=label, field_type=ftype, aggregation=agg))

    return FormReport(
        workflow_id=str(wf.id),
        workflow_name=wf.name,
        total_responses=total,
        internal_count=internal_count,
        guest_count=guest_count,
        first_submission=first_dt,
        last_submission=last_dt,
        fields=field_reports,
    )
