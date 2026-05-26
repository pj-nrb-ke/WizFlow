"""Enterprise KPI aggregations from workflow instances and events."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from statistics import mean
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import User, WorkflowDefinition, WorkflowEvent, WorkflowInstance
from app.schemas.analytics import (
    ApproverBottleneckRow,
    BottlenecksOut,
    DepartmentPerformanceOut,
    DepartmentPerformanceRow,
    ExceptionsOut,
    ExecutiveSummaryOut,
    FinancialBreakdownOut,
    StepBottleneckRow,
    TrendsOut,
    TrendPoint,
    UserPerformanceOut,
    UserPerformanceRow,
    WorkflowPerformanceOut,
    WorkflowPerformanceRow,
)

DEFAULT_SLA_HOURS = 48
TERMINAL_STATUSES = frozenset({"approved", "rejected"})
STEP_DECISION_EVENTS = frozenset({"step.approved", "step.rejected", "step.returned"})


@dataclass
class AnalyticsContext:
    company_id: UUID
    from_date: datetime | None
    to_date: datetime | None
    workflow_id: UUID | None


def sla_hours_from_settings(settings: dict | None) -> int:
    raw = (settings or {}).get("sla_hours")
    if raw is None:
        return DEFAULT_SLA_HOURS
    try:
        return int(raw)
    except (TypeError, ValueError):
        return DEFAULT_SLA_HOURS


def is_overdue(
    inst: WorkflowInstance,
    *,
    sla_hours: int,
    now: datetime,
) -> bool:
    if inst.status != "in_progress" or not inst.submitted_at:
        return False
    deadline = inst.submitted_at + timedelta(hours=sla_hours)
    return now > deadline


def _amount(data: dict | None) -> float:
    raw = (data or {}).get("amount")
    if raw is None:
        return 0.0
    try:
        return float(raw)
    except (TypeError, ValueError):
        return 0.0


def _department(data: dict | None) -> str | None:
    raw = (data or {}).get("department")
    if raw is None:
        return None
    text = str(raw).strip()
    return text or None


def _pct(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return round(100.0 * numerator / denominator, 2)


def _hours_between(start: datetime | None, end: datetime | None) -> float | None:
    if not start or not end:
        return None
    delta = end - start
    return round(delta.total_seconds() / 3600.0, 2)


def _load_sla_map(db: Session, company_id: UUID) -> dict[UUID, int]:
    rows = db.scalars(
        select(WorkflowDefinition).where(WorkflowDefinition.company_id == company_id)
    )
    return {d.id: sla_hours_from_settings(d.settings) for d in rows}


def _instance_query(ctx: AnalyticsContext) -> select:
    q = select(WorkflowInstance).where(
        WorkflowInstance.company_id == ctx.company_id,
        WorkflowInstance.submitted_at.isnot(None),
    )
    if ctx.from_date:
        q = q.where(WorkflowInstance.submitted_at >= ctx.from_date)
    if ctx.to_date:
        q = q.where(WorkflowInstance.submitted_at <= ctx.to_date)
    if ctx.workflow_id:
        q = q.where(WorkflowInstance.workflow_definition_id == ctx.workflow_id)
    return q


def _load_instances(db: Session, ctx: AnalyticsContext) -> list[WorkflowInstance]:
    return list(db.scalars(_instance_query(ctx)))


def _instance_overdue(db: Session, inst: WorkflowInstance, sla_map: dict, now: datetime) -> bool:
    defn = db.get(WorkflowDefinition, inst.workflow_definition_id)
    if inst.status != "in_progress":
        return False
    from app.services.sla_engine import is_step_overdue

    if defn and is_step_overdue(db, inst, defn, now=now):
        return True
    return is_overdue(inst, sla_hours=_sla_for(inst, sla_map), now=now)


def _sla_for(inst: WorkflowInstance, sla_map: dict[UUID, int]) -> int:
    return sla_map.get(inst.workflow_definition_id, DEFAULT_SLA_HOURS)


def _cycle_hours(inst: WorkflowInstance) -> float | None:
    if not inst.submitted_at:
        return None
    end = inst.updated_at or inst.submitted_at
    return _hours_between(inst.submitted_at, end)


def _is_sla_compliant(inst: WorkflowInstance, sla_hours: int, now: datetime) -> bool:
    if not inst.submitted_at:
        return True
    if inst.status == "in_progress":
        return not is_overdue(inst, sla_hours=sla_hours, now=now)
    end = inst.updated_at or now
    elapsed = end - inst.submitted_at
    return elapsed <= timedelta(hours=sla_hours)


def _pending_inbox_for_user(db: Session, company_id: UUID, user_id: UUID) -> int:
    uid = str(user_id)
    rows = db.scalars(
        select(WorkflowInstance).where(
            WorkflowInstance.company_id == company_id,
            WorkflowInstance.status == "in_progress",
        )
    )
    count = 0
    for inst in rows:
        if inst.claimed_by_user_id == user_id:
            count += 1
            continue
        if any(a.get("user_id") == uid for a in (inst.assignees or [])):
            if inst.assignment_mode != "claim" or not inst.claimed_by_user_id:
                count += 1
    return count


def executive_summary(db: Session, ctx: AnalyticsContext) -> ExecutiveSummaryOut:
    now = datetime.now(timezone.utc)
    sla_map = _load_sla_map(db, ctx.company_id)
    instances = _load_instances(db, ctx)

    counts = defaultdict(int)
    cycle_hours: list[float] = []
    sla_ok = 0
    sla_total = 0

    for inst in instances:
        counts[inst.status] += 1
        counts["total"] += 1
        sla = _sla_for(inst, sla_map)
        if _instance_overdue(db, inst, sla_map, now):
            counts["overdue"] += 1
        if inst.submitted_at:
            sla_total += 1
            if _is_sla_compliant(inst, sla, now):
                sla_ok += 1
        if inst.status == "approved":
            hours = _cycle_hours(inst)
            if hours is not None:
                cycle_hours.append(hours)

    decided = counts["approved"] + counts["rejected"]
    return ExecutiveSummaryOut(
        total_requests=counts["total"],
        in_progress=counts["in_progress"],
        approved=counts["approved"],
        rejected=counts["rejected"],
        returned=counts["returned"],
        overdue_count=counts["overdue"],
        avg_cycle_hours=round(mean(cycle_hours), 2) if cycle_hours else None,
        rejection_rate=_pct(counts["rejected"], decided),
        sla_compliance_pct=_pct(sla_ok, sla_total),
    )


def workflow_performance(db: Session, ctx: AnalyticsContext) -> WorkflowPerformanceOut:
    now = datetime.now(timezone.utc)
    sla_map = _load_sla_map(db, ctx.company_id)
    instances = _load_instances(db, ctx)

    buckets: dict[str, dict] = {}
    for inst in instances:
        key = inst.workflow_name or "Unknown"
        row = buckets.setdefault(
            key,
            {
                "workflow_name": key,
                "workflow_definition_id": inst.workflow_definition_id,
                "total": 0,
                "in_progress": 0,
                "approved": 0,
                "rejected": 0,
                "returned": 0,
                "overdue": 0,
                "cycle_hours": [],
                "rejected_n": 0,
                "decided_n": 0,
            },
        )
        row["total"] += 1
        status = inst.status
        if status in ("in_progress", "approved", "rejected", "returned"):
            row[status] += 1
        sla = _sla_for(inst, sla_map)
        if _instance_overdue(db, inst, sla_map, now):
            row["overdue"] += 1
        if status in TERMINAL_STATUSES:
            row["decided_n"] += 1
        if status == "rejected":
            row["rejected_n"] += 1
        if status == "approved":
            hours = _cycle_hours(inst)
            if hours is not None:
                row["cycle_hours"].append(hours)

    workflows = [
        WorkflowPerformanceRow(
            workflow_name=b["workflow_name"],
            workflow_definition_id=b["workflow_definition_id"],
            total=b["total"],
            in_progress=b["in_progress"],
            approved=b["approved"],
            rejected=b["rejected"],
            returned=b["returned"],
            overdue_count=b["overdue"],
            avg_cycle_hours=round(mean(b["cycle_hours"]), 2) if b["cycle_hours"] else None,
            rejection_rate=_pct(b["rejected_n"], b["decided_n"]),
        )
        for b in sorted(buckets.values(), key=lambda x: (-x["total"], x["workflow_name"]))
    ]
    return WorkflowPerformanceOut(workflows=workflows)


def user_performance(db: Session, ctx: AnalyticsContext) -> UserPerformanceOut:
    instances = _load_instances(db, ctx)
    instance_ids = [i.id for i in instances]
    if not instance_ids:
        return UserPerformanceOut(users=[])

    events = list(
        db.scalars(
            select(WorkflowEvent)
            .where(
                WorkflowEvent.company_id == ctx.company_id,
                WorkflowEvent.instance_id.in_(instance_ids),
                WorkflowEvent.event_type.in_(("step.started", "step.approved", "step.rejected")),
            )
            .order_by(WorkflowEvent.created_at.asc())
        )
    )

    started_at: dict[tuple[UUID, str], datetime] = {}
    response_hours: dict[UUID, list[float]] = defaultdict(list)
    action_counts: dict[UUID, dict[str, int]] = defaultdict(lambda: {"approved": 0, "rejected": 0})

    for ev in events:
        payload = ev.payload or {}
        step_id = payload.get("step_id") or ""
        inst_id = ev.instance_id
        if not inst_id:
            continue
        key = (inst_id, step_id)
        if ev.event_type == "step.started":
            started_at[key] = ev.created_at
        elif ev.event_type in ("step.approved", "step.rejected") and ev.actor_user_id:
            start = started_at.get(key)
            if start:
                hours = _hours_between(start, ev.created_at)
                if hours is not None:
                    response_hours[ev.actor_user_id].append(hours)
            if ev.event_type == "step.approved":
                action_counts[ev.actor_user_id]["approved"] += 1
            else:
                action_counts[ev.actor_user_id]["rejected"] += 1

    user_ids = set(action_counts.keys())
    users_by_id: dict[UUID, User] = {}
    if user_ids:
        for u in db.scalars(select(User).where(User.id.in_(user_ids))):
            users_by_id[u.id] = u

    rows: list[UserPerformanceRow] = []
    for uid in sorted(user_ids, key=lambda x: str(x)):
        u = users_by_id.get(uid)
        hours_list = response_hours.get(uid, [])
        rows.append(
            UserPerformanceRow(
                user_id=uid,
                full_name=u.full_name if u else "Unknown",
                approvals_count=action_counts[uid]["approved"],
                rejections_count=action_counts[uid]["rejected"],
                avg_response_hours=round(mean(hours_list), 2) if hours_list else None,
                pending_inbox=_pending_inbox_for_user(db, ctx.company_id, uid),
            )
        )
    rows.sort(key=lambda r: (-r.approvals_count, r.full_name))
    return UserPerformanceOut(users=rows)


def bottlenecks(db: Session, ctx: AnalyticsContext) -> BottlenecksOut:
    instances = _load_instances(db, ctx)
    instance_ids = [i.id for i in instances]
    if not instance_ids:
        return BottlenecksOut()

    events = list(
        db.scalars(
            select(WorkflowEvent)
            .where(
                WorkflowEvent.company_id == ctx.company_id,
                WorkflowEvent.instance_id.in_(instance_ids),
                WorkflowEvent.event_type.in_(("step.started", *STEP_DECISION_EVENTS)),
            )
            .order_by(WorkflowEvent.created_at.asc())
        )
    )

    started_at: dict[tuple[UUID, str], tuple[datetime, str | None]] = {}
    step_hours: dict[str, list[float]] = defaultdict(list)
    step_names: dict[str, str | None] = {}
    approver_hours: dict[UUID, list[float]] = defaultdict(list)

    for ev in events:
        payload = ev.payload or {}
        step_id = payload.get("step_id") or "unknown"
        step_name = payload.get("step_name")
        inst_id = ev.instance_id
        if not inst_id:
            continue
        key = (inst_id, step_id)
        if ev.event_type == "step.started":
            started_at[key] = (ev.created_at, step_name)
            if step_name:
                step_names[step_id] = step_name
        elif ev.event_type in STEP_DECISION_EVENTS:
            start_info = started_at.get(key)
            if not start_info:
                continue
            start, name = start_info
            if name:
                step_names[step_id] = name
            hours = _hours_between(start, ev.created_at)
            if hours is not None:
                step_hours[step_id].append(hours)
                if ev.actor_user_id and ev.event_type in ("step.approved", "step.rejected"):
                    approver_hours[ev.actor_user_id].append(hours)

    slowest_steps = [
        StepBottleneckRow(
            step_id=sid,
            step_name=step_names.get(sid),
            avg_hours=round(mean(hours), 2),
            sample_count=len(hours),
        )
        for sid, hours in step_hours.items()
        if hours
    ]
    slowest_steps.sort(key=lambda r: (-r.avg_hours, -r.sample_count))
    slowest_steps = slowest_steps[:10]

    user_ids = list(approver_hours.keys())
    users_by_id: dict[UUID, User] = {}
    if user_ids:
        for u in db.scalars(select(User).where(User.id.in_(user_ids))):
            users_by_id[u.id] = u

    slowest_approvers = [
        ApproverBottleneckRow(
            user_id=uid,
            full_name=users_by_id[uid].full_name if uid in users_by_id else "Unknown",
            avg_response_hours=round(mean(hours), 2),
            sample_count=len(hours),
        )
        for uid, hours in approver_hours.items()
        if hours
    ]
    slowest_approvers.sort(key=lambda r: (-r.avg_response_hours, -r.sample_count))
    slowest_approvers = slowest_approvers[:10]

    return BottlenecksOut(slowest_steps=slowest_steps, slowest_approvers=slowest_approvers)


def financial_breakdown(db: Session, ctx: AnalyticsContext) -> FinancialBreakdownOut:
    instances = _load_instances(db, ctx)
    approved = rejected = in_progress = 0.0
    for inst in instances:
        amt = _amount(inst.request_data)
        if inst.status == "approved":
            approved += amt
        elif inst.status == "rejected":
            rejected += amt
        elif inst.status == "in_progress":
            in_progress += amt
    total = approved + rejected + in_progress
    return FinancialBreakdownOut(
        approved_amount=round(approved, 2),
        rejected_amount=round(rejected, 2),
        in_progress_amount=round(in_progress, 2),
        total_amount=round(total, 2),
    )


def exceptions_summary(db: Session, ctx: AnalyticsContext) -> ExceptionsOut:
    now = datetime.now(timezone.utc)
    sla_map = _load_sla_map(db, ctx.company_id)
    instances = _load_instances(db, ctx)
    overdue = 0
    rejected = 0
    returned = 0
    for inst in instances:
        if inst.status == "rejected":
            rejected += 1
        elif inst.status == "returned":
            returned += 1
        if _instance_overdue(db, inst, sla_map, now):
            overdue += 1
    return ExceptionsOut(
        rejected_count=rejected,
        returned_count=returned,
        overdue_count=overdue,
    )


def submission_trends(db: Session, ctx: AnalyticsContext) -> TrendsOut:
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=30)
    if ctx.from_date and ctx.from_date > window_start:
        window_start = ctx.from_date

    q = select(WorkflowInstance).where(
        WorkflowInstance.company_id == ctx.company_id,
        WorkflowInstance.submitted_at.isnot(None),
        WorkflowInstance.submitted_at >= window_start,
    )
    if ctx.to_date:
        q = q.where(WorkflowInstance.submitted_at <= ctx.to_date)
    if ctx.workflow_id:
        q = q.where(WorkflowInstance.workflow_definition_id == ctx.workflow_id)

    daily: dict[date, int] = defaultdict(int)
    for inst in db.scalars(q):
        if inst.submitted_at:
            daily[inst.submitted_at.date()] += 1

    start_day = window_start.date()
    end_day = (ctx.to_date or now).date()
    days: list[TrendPoint] = []
    cursor = start_day
    while cursor <= end_day:
        days.append(TrendPoint(date=cursor, submissions=daily.get(cursor, 0)))
        cursor += timedelta(days=1)
    if len(days) > 31:
        days = days[-31:]
    return TrendsOut(days=days)


def department_performance(db: Session, ctx: AnalyticsContext) -> DepartmentPerformanceOut:
    now = datetime.now(timezone.utc)
    sla_map = _load_sla_map(db, ctx.company_id)
    instances = _load_instances(db, ctx)

    buckets: dict[str, dict] = {}
    for inst in instances:
        dept = _department(inst.request_data) or "Unspecified"
        row = buckets.setdefault(
            dept,
            {
                "total": 0,
                "in_progress": 0,
                "approved": 0,
                "rejected": 0,
                "returned": 0,
                "overdue": 0,
                "amount": 0.0,
            },
        )
        row["total"] += 1
        status = inst.status
        if status in ("in_progress", "approved", "rejected", "returned"):
            row[status] += 1
        if _instance_overdue(db, inst, sla_map, now):
            row["overdue"] += 1
        row["amount"] += _amount(inst.request_data)

    departments = [
        DepartmentPerformanceRow(
            department=name,
            total=b["total"],
            in_progress=b["in_progress"],
            approved=b["approved"],
            rejected=b["rejected"],
            returned=b["returned"],
            overdue_count=b["overdue"],
            total_amount=round(b["amount"], 2),
        )
        for name, b in sorted(buckets.items(), key=lambda x: (-x[1]["total"], x[0]))
    ]
    return DepartmentPerformanceOut(departments=departments)
