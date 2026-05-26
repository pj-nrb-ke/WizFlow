"""AI management narratives for analytics (Phase 3)."""

from __future__ import annotations

from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.services import analytics as analytics_service


def executive_narrative(db: Session, ctx: analytics_service.AnalyticsContext) -> str:
    summary = analytics_service.executive_summary(db, ctx)
    bottlenecks = analytics_service.bottlenecks(db, ctx)

    if not settings.ai_api_key:
        return _template_narrative(summary, bottlenecks)

    prompt = (
        "Write 3 short paragraphs for a manager: workflow KPI summary, main bottleneck, and one recommendation. "
        f"Data: {summary.model_dump()}, bottlenecks: {bottlenecks.model_dump()}"
    )
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.ai_api_key}"},
                json={
                    "model": settings.ai_model,
                    "messages": [
                        {"role": "system", "content": "You are a concise business analyst for workflow KPIs."},
                        {"role": "user", "content": prompt[:8000]},
                    ],
                    "temperature": 0.4,
                },
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        return _template_narrative(summary, bottlenecks)


def _template_narrative(summary, bottlenecks) -> str:
    total = summary.total_requests
    pending = summary.in_progress
    overdue = summary.overdue_count
    sla = summary.sla_compliance_pct
    slow = bottlenecks.slowest_steps[:1]
    slow_txt = (slow[0].step_name or slow[0].step_id) if slow else "no single dominant step"
    return (
        f"In the selected period, {total} requests were tracked with {pending} still pending approval "
        f"and {overdue} overdue against SLA targets ({sla:.0f}% compliance).\n\n"
        f"The primary delay pattern appears at: {slow_txt}. Review assignee workload in the People analytics tab.\n\n"
        f"Recommendation: focus on clearing overdue items and tightening SLA on high-volume workflows."
    )
