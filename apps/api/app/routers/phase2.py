"""Phase 2: KPI targets, subscriptions, schedules, automation cron."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_roles
from app.db.models import KpiTarget, ReportSubscription, WorkflowSchedule
from app.db.session import get_db
from app.schemas.phase2 import (
    AutomationRunOut,
    KpiTargetCreate,
    KpiTargetOut,
    KpiTargetUpdate,
    ReportSubscriptionCreate,
    ReportSubscriptionOut,
    WorkflowScheduleCreate,
    WorkflowScheduleOut,
)
from app.services.phase2_automation import run_all_automation

router = APIRouter(tags=["Phase 2"])
ADMIN_ROLES = ("company_admin", "manager")


@router.get("/kpi-targets", response_model=list[KpiTargetOut])
def list_kpi_targets(
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> list[KpiTargetOut]:
    rows = db.scalars(select(KpiTarget).where(KpiTarget.company_id == user.company_id).order_by(KpiTarget.metric_key))
    return [
        KpiTargetOut(
            id=r.id,
            metric_key=r.metric_key,
            label=r.label,
            target_value=r.target_value,
            unit=r.unit,
        )
        for r in rows
    ]


@router.post("/kpi-targets", response_model=KpiTargetOut, status_code=status.HTTP_201_CREATED)
def create_kpi_target(
    body: KpiTargetCreate,
    user: CurrentUser = Depends(require_roles("company_admin")),
    db: Session = Depends(get_db),
) -> KpiTargetOut:
    existing = db.scalar(
        select(KpiTarget).where(
            KpiTarget.company_id == user.company_id,
            KpiTarget.metric_key == body.metric_key.strip(),
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Metric key already exists")
    row = KpiTarget(
        company_id=user.company_id,
        metric_key=body.metric_key.strip(),
        label=body.label.strip(),
        target_value=body.target_value,
        unit=body.unit,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return KpiTargetOut(id=row.id, metric_key=row.metric_key, label=row.label, target_value=row.target_value, unit=row.unit)


@router.patch("/kpi-targets/{target_id}", response_model=KpiTargetOut)
def update_kpi_target(
    target_id: UUID,
    body: KpiTargetUpdate,
    user: CurrentUser = Depends(require_roles("company_admin")),
    db: Session = Depends(get_db),
) -> KpiTargetOut:
    row = db.get(KpiTarget, target_id)
    if not row or row.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Not found")
    if body.label is not None:
        row.label = body.label.strip()
    if body.target_value is not None:
        row.target_value = body.target_value
    if body.unit is not None:
        row.unit = body.unit
    db.commit()
    db.refresh(row)
    return KpiTargetOut(id=row.id, metric_key=row.metric_key, label=row.label, target_value=row.target_value, unit=row.unit)


@router.delete("/kpi-targets/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_kpi_target(
    target_id: UUID,
    user: CurrentUser = Depends(require_roles("company_admin")),
    db: Session = Depends(get_db),
) -> None:
    row = db.get(KpiTarget, target_id)
    if not row or row.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()


@router.get("/report-subscriptions", response_model=list[ReportSubscriptionOut])
def list_report_subscriptions(
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> list[ReportSubscriptionOut]:
    rows = db.scalars(
        select(ReportSubscription)
        .where(ReportSubscription.company_id == user.company_id, ReportSubscription.user_id == user.id)
        .order_by(ReportSubscription.created_at.desc())
    )
    return [
        ReportSubscriptionOut(
            id=r.id,
            name=r.name,
            report_type=r.report_type,
            frequency=r.frequency,
            filters=r.filters or {},
            is_active=r.is_active,
            last_sent_at=r.last_sent_at,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/report-subscriptions", response_model=ReportSubscriptionOut, status_code=status.HTTP_201_CREATED)
def create_report_subscription(
    body: ReportSubscriptionCreate,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> ReportSubscriptionOut:
    row = ReportSubscription(
        company_id=user.company_id,
        user_id=user.id,
        name=body.name.strip(),
        report_type=body.report_type,
        frequency=body.frequency,
        filters=body.filters,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ReportSubscriptionOut(
        id=row.id,
        name=row.name,
        report_type=row.report_type,
        frequency=row.frequency,
        filters=row.filters or {},
        is_active=row.is_active,
        last_sent_at=row.last_sent_at,
        created_at=row.created_at,
    )


@router.delete("/report-subscriptions/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report_subscription(
    sub_id: UUID,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> None:
    row = db.get(ReportSubscription, sub_id)
    if not row or row.company_id != user.company_id or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()


@router.get("/workflow-schedules", response_model=list[WorkflowScheduleOut])
def list_workflow_schedules(
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> list[WorkflowScheduleOut]:
    rows = db.scalars(
        select(WorkflowSchedule)
        .where(WorkflowSchedule.company_id == user.company_id)
        .order_by(WorkflowSchedule.name)
    )
    return [
        WorkflowScheduleOut(
            id=r.id,
            workflow_definition_id=r.workflow_definition_id,
            name=r.name,
            frequency=r.frequency,
            initiator_user_id=r.initiator_user_id,
            default_data=r.default_data or {},
            is_active=r.is_active,
            last_run_at=r.last_run_at,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/workflow-schedules", response_model=WorkflowScheduleOut, status_code=status.HTTP_201_CREATED)
def create_workflow_schedule(
    body: WorkflowScheduleCreate,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> WorkflowScheduleOut:
    row = WorkflowSchedule(
        company_id=user.company_id,
        workflow_definition_id=body.workflow_definition_id,
        name=body.name.strip(),
        frequency=body.frequency,
        initiator_user_id=body.initiator_user_id or user.id,
        default_data=body.default_data,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return WorkflowScheduleOut(
        id=row.id,
        workflow_definition_id=row.workflow_definition_id,
        name=row.name,
        frequency=row.frequency,
        initiator_user_id=row.initiator_user_id,
        default_data=row.default_data or {},
        is_active=row.is_active,
        last_run_at=row.last_run_at,
        created_at=row.created_at,
    )


@router.delete("/workflow-schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workflow_schedule(
    schedule_id: UUID,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> None:
    row = db.get(WorkflowSchedule, schedule_id)
    if not row or row.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()


@router.post("/automation/run", response_model=AutomationRunOut)
def run_automation(
    user: CurrentUser = Depends(require_roles("company_admin")),
    db: Session = Depends(get_db),
) -> AutomationRunOut:
    """Run SLA alerts, escalations, scheduled reports, and recurring workflows."""
    return run_all_automation(db, company_id=user.company_id)
