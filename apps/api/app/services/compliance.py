"""Compliance dashboard metrics."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import WorkflowInstance
from app.services import analytics as analytics_service


def compliance_summary(db: Session, ctx: analytics_service.AnalyticsContext) -> dict:
    q = select(WorkflowInstance).where(WorkflowInstance.company_id == ctx.company_id)
    if ctx.workflow_id:
        q = q.where(WorkflowInstance.workflow_definition_id == ctx.workflow_id)
    rows = list(db.scalars(q))
    if ctx.from_date:
        rows = [r for r in rows if r.created_at and r.created_at >= ctx.from_date]
    if ctx.to_date:
        rows = [r for r in rows if r.created_at and r.created_at <= ctx.to_date]

    now = datetime.now(timezone.utc)
    open_rows = [r for r in rows if r.status == "in_progress"]
    returned = [r for r in rows if r.status == "returned"]
    overdue = [
        r
        for r in open_rows
        if analytics_service.is_overdue(r, sla_hours=48, now=now)
    ]

    policy_gaps: list[dict] = []
    for r in overdue[:10]:
        policy_gaps.append(
            {
                "type": "overdue",
                "reference_number": r.reference_number,
                "workflow_name": r.workflow_name,
                "message": f"Overdue: {r.reference_number or r.id}",
            }
        )
    for r in returned[:5]:
        policy_gaps.append(
            {
                "type": "returned",
                "reference_number": r.reference_number,
                "workflow_name": r.workflow_name,
                "message": f"Awaiting originator correction: {r.reference_number or r.id}",
            }
        )

    missing_docs = sum(
        1
        for r in open_rows
        if isinstance(r.request_data, dict) and r.request_data.get("__missing_documents")
    )

    return {
        "total_open": len(open_rows),
        "missing_documents": missing_docs,
        "overdue_without_action": len(overdue),
        "returned_without_resubmit": len(returned),
        "policy_gaps": policy_gaps,
        "generated_at": datetime.now(timezone.utc),
    }
