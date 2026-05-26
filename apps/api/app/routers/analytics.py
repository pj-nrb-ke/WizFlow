"""Enterprise KPI and analytics endpoints."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_roles
from app.db.session import get_db
from app.schemas.integrations import AnomaliesOut, AnomalyFinding, NarrativeOut
from app.schemas.web_phases import ComplianceOut
from app.services import compliance as compliance_service
from app.schemas.analytics import (
    BottlenecksOut,
    DepartmentPerformanceOut,
    ExceptionsOut,
    ExecutiveSummaryOut,
    FinancialBreakdownOut,
    TrendsOut,
    UserPerformanceOut,
    WorkflowPerformanceOut,
)
from app.schemas.phase2 import (
    HeatmapOut,
    JourneyOut,
    ScorecardsOut,
    WorkloadHistoryOut,
    WorkloadOut,
)
from app.services import phase2_analytics
from app.services import ai_insights, anomaly
from app.services import analytics as analytics_service

router = APIRouter(prefix="/analytics", tags=["Analytics"])

ADMIN_ROLES = ("company_admin", "manager")


def _ctx(
    user: CurrentUser,
    from_date: datetime | None,
    to_date: datetime | None,
    workflow_id: UUID | None,
) -> analytics_service.AnalyticsContext:
    return analytics_service.AnalyticsContext(
        company_id=user.company_id,
        from_date=from_date,
        to_date=to_date,
        workflow_id=workflow_id,
    )


@router.get("/executive", response_model=ExecutiveSummaryOut)
def get_executive(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    workflow_id: UUID | None = None,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> ExecutiveSummaryOut:
    return analytics_service.executive_summary(db, _ctx(user, from_date, to_date, workflow_id))


@router.get("/workflows", response_model=WorkflowPerformanceOut)
def get_workflows(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    workflow_id: UUID | None = None,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> WorkflowPerformanceOut:
    return analytics_service.workflow_performance(db, _ctx(user, from_date, to_date, workflow_id))


@router.get("/users", response_model=UserPerformanceOut)
def get_users(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    workflow_id: UUID | None = None,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> UserPerformanceOut:
    return analytics_service.user_performance(db, _ctx(user, from_date, to_date, workflow_id))


@router.get("/bottlenecks", response_model=BottlenecksOut)
def get_bottlenecks(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    workflow_id: UUID | None = None,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> BottlenecksOut:
    return analytics_service.bottlenecks(db, _ctx(user, from_date, to_date, workflow_id))


@router.get("/financial", response_model=FinancialBreakdownOut)
def get_financial(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    workflow_id: UUID | None = None,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> FinancialBreakdownOut:
    return analytics_service.financial_breakdown(db, _ctx(user, from_date, to_date, workflow_id))


@router.get("/exceptions", response_model=ExceptionsOut)
def get_exceptions(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    workflow_id: UUID | None = None,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> ExceptionsOut:
    return analytics_service.exceptions_summary(db, _ctx(user, from_date, to_date, workflow_id))


@router.get("/trends", response_model=TrendsOut)
def get_trends(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    workflow_id: UUID | None = None,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> TrendsOut:
    return analytics_service.submission_trends(db, _ctx(user, from_date, to_date, workflow_id))


@router.get("/departments", response_model=DepartmentPerformanceOut)
def get_departments(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    workflow_id: UUID | None = None,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> DepartmentPerformanceOut:
    return analytics_service.department_performance(db, _ctx(user, from_date, to_date, workflow_id))


@router.get("/anomalies", response_model=AnomaliesOut)
def get_anomalies(
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> AnomaliesOut:
    findings = anomaly.detect_anomalies(db, user.company_id)
    return AnomaliesOut(
        findings=[AnomalyFinding(**f) for f in findings],
        generated_at=datetime.now(timezone.utc),
    )


@router.get("/narrative", response_model=NarrativeOut)
def get_narrative(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    workflow_id: UUID | None = None,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> NarrativeOut:
    text = ai_insights.executive_narrative(db, _ctx(user, from_date, to_date, workflow_id))
    return NarrativeOut(narrative=text, generated_at=datetime.now(timezone.utc))


@router.get("/workload", response_model=WorkloadOut)
def get_workload(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    workflow_id: UUID | None = None,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> WorkloadOut:
    return phase2_analytics.workload_snapshot(db, _ctx(user, from_date, to_date, workflow_id))


@router.get("/workload/history", response_model=WorkloadHistoryOut)
def get_workload_history(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    workflow_id: UUID | None = None,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> WorkloadHistoryOut:
    return phase2_analytics.workload_history(db, _ctx(user, from_date, to_date, workflow_id))


@router.get("/journey", response_model=JourneyOut)
def get_journey(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    workflow_id: UUID | None = None,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> JourneyOut:
    return phase2_analytics.journey_analytics(db, _ctx(user, from_date, to_date, workflow_id))


@router.get("/heatmap", response_model=HeatmapOut)
def get_heatmap(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    workflow_id: UUID | None = None,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> HeatmapOut:
    return phase2_analytics.approval_heatmap(db, _ctx(user, from_date, to_date, workflow_id))


@router.get("/scorecards", response_model=ScorecardsOut)
def get_scorecards(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    workflow_id: UUID | None = None,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> ScorecardsOut:
    return phase2_analytics.scorecards(db, _ctx(user, from_date, to_date, workflow_id))


@router.get("/compliance", response_model=ComplianceOut)
def get_compliance(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    workflow_id: UUID | None = None,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> ComplianceOut:
    data = compliance_service.compliance_summary(db, _ctx(user, from_date, to_date, workflow_id))
    return ComplianceOut(**data)
