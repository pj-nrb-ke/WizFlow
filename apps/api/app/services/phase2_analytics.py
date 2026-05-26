"""Phase 2 extended analytics: workload history, journey, heatmap, scorecards."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from statistics import mean
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import KpiTarget, User, WorkflowEvent, WorkflowInstance
from app.schemas.phase2 import (
    HeatmapCell,
    HeatmapOut,
    JourneyEdge,
    JourneyOut,
    ScorecardRow,
    ScorecardsOut,
    WorkloadHistoryPoint,
    WorkloadHistoryOut,
    WorkloadSnapshotRow,
    WorkloadOut,
)
from app.services import analytics as analytics_service
from app.services.analytics import AnalyticsContext, _load_instances, _pct


def workload_snapshot(db: Session, ctx: AnalyticsContext) -> WorkloadOut:
    perf = analytics_service.user_performance(db, ctx)
    rows = [
        WorkloadSnapshotRow(
            user_id=u.user_id,
            full_name=u.full_name,
            pending_count=u.pending_inbox,
            approvals_in_period=u.approvals_count,
            avg_response_hours=u.avg_response_hours,
        )
        for u in perf.users
    ]
    return WorkloadOut(users=rows)


def workload_history(db: Session, ctx: AnalyticsContext, *, weeks: int = 8) -> WorkloadHistoryOut:
    now = datetime.now(timezone.utc)
    start = now - timedelta(weeks=weeks)
    instances = _load_instances(db, ctx)
    instance_ids = [i.id for i in instances if i.submitted_at and i.submitted_at >= start]
    if not instance_ids:
        return WorkloadHistoryOut(weeks=[])

    events = list(
        db.scalars(
            select(WorkflowEvent)
            .where(
                WorkflowEvent.company_id == ctx.company_id,
                WorkflowEvent.instance_id.in_(instance_ids),
                WorkflowEvent.event_type.in_(("step.approved", "step.rejected")),
                WorkflowEvent.created_at >= start,
            )
        )
    )
    by_week: dict[date, dict[UUID, int]] = defaultdict(lambda: defaultdict(int))
    for ev in events:
        if not ev.actor_user_id or not ev.created_at:
            continue
        week_start = (ev.created_at.date() - timedelta(days=ev.created_at.weekday()))
        by_week[week_start][ev.actor_user_id] += 1

    user_ids = {uid for w in by_week.values() for uid in w}
    users_by_id: dict[UUID, User] = {}
    if user_ids:
        for u in db.scalars(select(User).where(User.id.in_(user_ids))):
            users_by_id[u.id] = u

    weeks_out: list[WorkloadHistoryPoint] = []
    for week_start in sorted(by_week.keys()):
        for uid, count in sorted(by_week[week_start].items(), key=lambda x: -x[1]):
            u = users_by_id.get(uid)
            weeks_out.append(
                WorkloadHistoryPoint(
                    week_start=week_start,
                    user_id=uid,
                    full_name=u.full_name if u else "Unknown",
                    actions_count=count,
                )
            )
    return WorkloadHistoryOut(weeks=weeks_out)


def journey_analytics(db: Session, ctx: AnalyticsContext) -> JourneyOut:
    instances = _load_instances(db, ctx)
    instance_ids = [i.id for i in instances]
    if not instance_ids:
        return JourneyOut()

    events = list(
        db.scalars(
            select(WorkflowEvent)
            .where(
                WorkflowEvent.company_id == ctx.company_id,
                WorkflowEvent.instance_id.in_(instance_ids),
                WorkflowEvent.event_type.in_(("step.started", "step.approved", "step.rejected", "step.returned")),
            )
            .order_by(WorkflowEvent.created_at.asc())
        )
    )
    edge_hours: dict[tuple[str, str], list[float]] = defaultdict(list)
    last_step: dict[UUID, tuple[str, datetime]] = {}

    for ev in events:
        if not ev.instance_id:
            continue
        payload = ev.payload or {}
        step_id = str(payload.get("step_id") or "unknown")
        if ev.event_type == "step.started":
            prev = last_step.get(ev.instance_id)
            if prev:
                prev_id, prev_at = prev
                hours = (ev.created_at - prev_at).total_seconds() / 3600.0
                if hours >= 0:
                    edge_hours[(prev_id, step_id)].append(hours)
            last_step[ev.instance_id] = (step_id, ev.created_at)

    edges = [
        JourneyEdge(
            from_step=f,
            to_step=t,
            avg_hours=round(mean(hours), 2),
            sample_count=len(hours),
        )
        for (f, t), hours in edge_hours.items()
        if hours
    ]
    edges.sort(key=lambda e: (-e.sample_count, -e.avg_hours))
    return JourneyOut(edges=edges[:20])


def approval_heatmap(db: Session, ctx: AnalyticsContext) -> HeatmapOut:
    instances = _load_instances(db, ctx)
    cells: dict[tuple[int, int], int] = defaultdict(int)
    for inst in instances:
        if not inst.submitted_at:
            continue
        dt = inst.submitted_at
        cells[(dt.weekday(), dt.hour)] += 1

    instance_ids = [i.id for i in instances]
    if instance_ids:
        events = list(
            db.scalars(
                select(WorkflowEvent)
                .where(
                    WorkflowEvent.company_id == ctx.company_id,
                    WorkflowEvent.instance_id.in_(instance_ids),
                    WorkflowEvent.event_type.in_(("step.approved", "step.rejected")),
                )
            )
        )
        for ev in events:
            if ev.created_at:
                cells[(ev.created_at.weekday(), ev.created_at.hour)] += 1

    out = [
        HeatmapCell(day_of_week=d, hour=h, count=c)
        for (d, h), c in cells.items()
    ]
    out.sort(key=lambda x: (-x.count, x.day_of_week, x.hour))
    return HeatmapOut(cells=out)


def scorecards(db: Session, ctx: AnalyticsContext) -> ScorecardsOut:
    exec_sum = analytics_service.executive_summary(db, ctx)
    perf = analytics_service.user_performance(db, ctx)
    targets = list(
        db.scalars(select(KpiTarget).where(KpiTarget.company_id == ctx.company_id))
    )
    target_map = {t.metric_key: t for t in targets}

    def target_val(key: str, default: float) -> float:
        t = target_map.get(key)
        return float(t.target_value) if t else default

    dept_rows = analytics_service.department_performance(db, ctx)
    rows: list[ScorecardRow] = []

    sla_target = target_val("sla_compliance_pct", 90.0)
    sla_actual = exec_sum.sla_compliance_pct
    rows.append(
        ScorecardRow(
            entity_type="company",
            entity_id=str(ctx.company_id),
            entity_name="Company",
            metric_key="sla_compliance_pct",
            actual_value=sla_actual,
            target_value=sla_target,
            score_pct=min(100.0, round(100.0 * sla_actual / sla_target, 1)) if sla_target else 100.0,
            grade=_grade(sla_actual, sla_target, higher_is_better=True),
        )
    )

    overdue_target = target_val("max_overdue_count", 5.0)
    overdue_actual = float(exec_sum.overdue_count)
    rows.append(
        ScorecardRow(
            entity_type="company",
            entity_id=str(ctx.company_id),
            entity_name="Company",
            metric_key="overdue_count",
            actual_value=overdue_actual,
            target_value=overdue_target,
            score_pct=min(100.0, round(100.0 * overdue_target / max(overdue_actual, 1), 1)),
            grade=_grade(overdue_actual, overdue_target, higher_is_better=False),
        )
    )

    for u in perf.users[:15]:
        resp_target = target_val("avg_response_hours", 24.0)
        actual = u.avg_response_hours or 0.0
        rows.append(
            ScorecardRow(
                entity_type="user",
                entity_id=str(u.user_id),
                entity_name=u.full_name,
                metric_key="avg_response_hours",
                actual_value=actual,
                target_value=resp_target,
                score_pct=min(100.0, round(100.0 * resp_target / max(actual, 0.1), 1)),
                grade=_grade(actual, resp_target, higher_is_better=False),
            )
        )

    for d in dept_rows.departments[:10]:
        rows.append(
            ScorecardRow(
                entity_type="department",
                entity_id=d.department,
                entity_name=d.department,
                metric_key="overdue_count",
                actual_value=float(d.overdue_count),
                target_value=target_val("dept_max_overdue", 3.0),
                score_pct=_pct(max(0, target_val("dept_max_overdue", 3) - d.overdue_count), target_val("dept_max_overdue", 3)),
                grade=_grade(d.overdue_count, target_val("dept_max_overdue", 3), higher_is_better=False),
            )
        )

    return ScorecardsOut(rows=rows)


def _grade(actual: float, target: float, *, higher_is_better: bool) -> str:
    if target <= 0:
        return "A"
    if higher_is_better:
        ratio = actual / target
    else:
        ratio = target / max(actual, 0.001)
    if ratio >= 1.0:
        return "A"
    if ratio >= 0.85:
        return "B"
    if ratio >= 0.7:
        return "C"
    return "D"
