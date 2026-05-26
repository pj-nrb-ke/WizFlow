from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class KpiTargetOut(BaseModel):
    id: UUID
    metric_key: str
    label: str
    target_value: float
    unit: str = "number"


class KpiTargetCreate(BaseModel):
    metric_key: str
    label: str
    target_value: float
    unit: str = "number"


class KpiTargetUpdate(BaseModel):
    label: str | None = None
    target_value: float | None = None
    unit: str | None = None


class ReportSubscriptionOut(BaseModel):
    id: UUID
    name: str
    report_type: str
    frequency: str
    filters: dict = Field(default_factory=dict)
    is_active: bool
    last_sent_at: datetime | None = None
    created_at: datetime


class ReportSubscriptionCreate(BaseModel):
    name: str
    report_type: str = "executive_summary"
    frequency: str = "weekly"
    filters: dict = Field(default_factory=dict)


class WorkflowScheduleOut(BaseModel):
    id: UUID
    workflow_definition_id: UUID
    name: str
    frequency: str
    initiator_user_id: UUID | None = None
    default_data: dict = Field(default_factory=dict)
    is_active: bool
    last_run_at: datetime | None = None
    created_at: datetime


class WorkflowScheduleCreate(BaseModel):
    workflow_definition_id: UUID
    name: str
    frequency: str = "monthly"
    initiator_user_id: UUID | None = None
    default_data: dict = Field(default_factory=dict)


class WorkloadSnapshotRow(BaseModel):
    user_id: UUID
    full_name: str
    pending_count: int = 0
    approvals_in_period: int = 0
    avg_response_hours: float | None = None


class WorkloadOut(BaseModel):
    users: list[WorkloadSnapshotRow] = Field(default_factory=list)


class WorkloadHistoryPoint(BaseModel):
    week_start: date
    user_id: UUID
    full_name: str
    actions_count: int = 0


class WorkloadHistoryOut(BaseModel):
    weeks: list[WorkloadHistoryPoint] = Field(default_factory=list)


class JourneyEdge(BaseModel):
    from_step: str
    to_step: str
    avg_hours: float
    sample_count: int = 0


class JourneyOut(BaseModel):
    edges: list[JourneyEdge] = Field(default_factory=list)


class HeatmapCell(BaseModel):
    day_of_week: int
    hour: int
    count: int = 0


class HeatmapOut(BaseModel):
    cells: list[HeatmapCell] = Field(default_factory=list)


class ScorecardRow(BaseModel):
    entity_type: str
    entity_id: str
    entity_name: str
    metric_key: str
    actual_value: float
    target_value: float
    score_pct: float = 0.0
    grade: str = "C"


class ScorecardsOut(BaseModel):
    rows: list[ScorecardRow] = Field(default_factory=list)


class AutomationRunOut(BaseModel):
    sla_warnings: int = 0
    sla_breaches: int = 0
    escalations: int = 0
    reports_sent: int = 0
    schedules_run: int = 0
