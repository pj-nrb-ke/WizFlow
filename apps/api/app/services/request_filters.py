"""Shared filters for My Requests list and export."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import Select, or_, select
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
    return q


def list_my_requests(
    db: Session,
    *,
    company_id: UUID,
    originator_user_id: UUID,
    status: str | None = None,
    q_text: str | None = None,
    workflow_id: UUID | None = None,
) -> list[WorkflowInstance]:
    q = apply_request_filters(
        select(WorkflowInstance),
        company_id=company_id,
        originator_user_id=originator_user_id,
        status=status,
        q_text=q_text,
        workflow_id=workflow_id,
    )
    return list(db.scalars(q.order_by(WorkflowInstance.created_at.desc())))
