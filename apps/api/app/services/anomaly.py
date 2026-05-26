"""Rule-based anomaly detection for requests (Phase 3 foundation)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import WorkflowInstance

DEFAULT_AMOUNT_THRESHOLD = 500_000


def detect_anomalies(
    db: Session,
    company_id: UUID,
    *,
    amount_threshold: float = DEFAULT_AMOUNT_THRESHOLD,
    lookback_days: int = 30,
) -> list[dict]:
    since = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    rows = db.scalars(
        select(WorkflowInstance).where(
            WorkflowInstance.company_id == company_id,
            WorkflowInstance.submitted_at >= since,
        )
    ).all()

    findings: list[dict] = []
    by_originator: dict[UUID, int] = {}

    for inst in rows:
        data = inst.request_data or {}
        amount = _parse_amount(data)
        oid = inst.originator_user_id

        if amount is not None and amount >= amount_threshold:
            findings.append(
                {
                    "type": "high_amount",
                    "severity": "high",
                    "instance_id": str(inst.id),
                    "reference_number": inst.reference_number,
                    "workflow_name": inst.workflow_name,
                    "message": f"Amount {amount:,.0f} exceeds threshold {amount_threshold:,.0f}",
                }
            )

        if oid:
            by_originator[oid] = by_originator.get(oid, 0) + 1

    repeaters = [uid for uid, n in by_originator.items() if n >= 15]
    if repeaters:
        findings.append(
            {
                "type": "high_volume_originator",
                "severity": "medium",
                "instance_id": None,
                "reference_number": None,
                "workflow_name": None,
                "message": f"{len(repeaters)} originator(s) submitted 15+ requests in {lookback_days} days",
            }
        )

    overdue = db.scalar(
        select(func.count())
        .select_from(WorkflowInstance)
        .where(
            WorkflowInstance.company_id == company_id,
            WorkflowInstance.status == "in_progress",
            WorkflowInstance.submitted_at < since,
        )
    )
    if overdue and overdue > 10:
        findings.append(
            {
                "type": "stale_in_progress",
                "severity": "medium",
                "instance_id": None,
                "reference_number": None,
                "workflow_name": None,
                "message": f"{overdue} requests in progress older than {lookback_days} days",
            }
        )

    return findings[:50]


def _parse_amount(data: dict) -> float | None:
    for key in ("amount", "total", "total_amount", "value"):
        if key in data:
            try:
                return float(str(data[key]).replace(",", ""))
            except (TypeError, ValueError):
                continue
    return None
