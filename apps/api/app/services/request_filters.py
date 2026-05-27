"""Shared filters for My Requests list and export."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Numeric, Select, cast, or_, select
from sqlalchemy.orm import Session

from app.db.models import WorkflowInstance


def apply_request_filters(
    q: Select,
    *,
    company_id: UUID,
    originator_user_id: UUID,
    status: str | None = None,
    q_text: str | None = None,
    workflow_id: UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    min_amount: float | None = None,
    max_amount: float | None = None,
    department: str | None = None,
) -> Select:
    q = q.where(
        WorkflowInstance.company_id == company_id,
        WorkflowInstance.originator_user_id == originator_user_id,
    )
    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        if statuses:
            q = q.where(WorkflowInstance.status.in_(statuses))
    if workflow_id:
        q = q.where(WorkflowInstance.workflow_definition_id == workflow_id)
    if q_text:
        term = f"%{q_text.strip()}%"
        q = q.where(
            or_(
                WorkflowInstance.reference_number.ilike(term),
                WorkflowInstance.workflow_name.ilike(term),
            )
        )
    if date_from:
        q = q.where(WorkflowInstance.submitted_at >= date_from)
    if date_to:
        q = q.where(WorkflowInstance.submitted_at <= date_to)
    if department:
        q = q.where(WorkflowInstance.request_data["department"].astext.ilike(f"%{department.strip()}%"))
    if min_amount is not None:
        q = q.where(cast(WorkflowInstance.request_data["amount"].astext, Numeric) >= min_amount)
    if max_amount is not None:
        q = q.where(cast(WorkflowInstance.request_data["amount"].astext, Numeric) <= max_amount)
    return q


def list_my_requests(
    db: Session,
    *,
    company_id: UUID,
    originator_user_id: UUID,
    status: str | None = None,
    q_text: str | None = None,
    workflow_id: UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    min_amount: float | None = None,
    max_amount: float | None = None,
    department: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[WorkflowInstance]:
    q = apply_request_filters(
        select(WorkflowInstance),
        company_id=company_id,
        originator_user_id=originator_user_id,
        status=status,
        q_text=q_text,
        workflow_id=workflow_id,
        date_from=date_from,
        date_to=date_to,
        min_amount=min_amount,
        max_amount=max_amount,
        department=department,
    )
    cap = max(1, min(limit, 200))
    return list(db.scalars(q.order_by(WorkflowInstance.created_at.desc()).limit(cap).offset(offset)))
