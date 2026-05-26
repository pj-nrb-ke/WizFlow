from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field


class ExecutiveSummaryOut(BaseModel):
    total_requests: int = 0
    in_progress: int = 0
    approved: int = 0
    rejected: int = 0
    returned: int = 0
    overdue_count: int = 0
    avg_cycle_hours: float | None = None
    rejection_rate: float = 0.0
    sla_compliance_pct: float = 0.0


class WorkflowPerformanceRow(BaseModel):
    workflow_name: str
    workflow_definition_id: UUID
    total: int = 0
    in_progress: int = 0
    approved: int = 0
    rejected: int = 0
    returned: int = 0
    overdue_count: int = 0
    avg_cycle_hours: float | None = None
    rejection_rate: float = 0.0


class WorkflowPerformanceOut(BaseModel):
    workflows: list[WorkflowPerformanceRow] = Field(default_factory=list)


class UserPerformanceRow(BaseModel):
    user_id: UUID
    full_name: str
    approvals_count: int = 0
    rejections_count: int = 0
    avg_response_hours: float | None = None
    pending_inbox: int = 0


class UserPerformanceOut(BaseModel):
    users: list[UserPerformanceRow] = Field(default_factory=list)


class StepBottleneckRow(BaseModel):
    step_id: str
    step_name: str | None = None
    avg_hours: float
    sample_count: int = 0


class ApproverBottleneckRow(BaseModel):
    user_id: UUID
    full_name: str
    avg_response_hours: float
    sample_count: int = 0


class BottlenecksOut(BaseModel):
    slowest_steps: list[StepBottleneckRow] = Field(default_factory=list)
    slowest_approvers: list[ApproverBottleneckRow] = Field(default_factory=list)


class FinancialBreakdownOut(BaseModel):
    approved_amount: float = 0.0
    rejected_amount: float = 0.0
    in_progress_amount: float = 0.0
    total_amount: float = 0.0


class ExceptionsOut(BaseModel):
    rejected_count: int = 0
    returned_count: int = 0
    overdue_count: int = 0


class TrendPoint(BaseModel):
    date: date
    submissions: int = 0


class TrendsOut(BaseModel):
    days: list[TrendPoint] = Field(default_factory=list)


class DepartmentPerformanceRow(BaseModel):
    department: str
    total: int = 0
    in_progress: int = 0
    approved: int = 0
    rejected: int = 0
    returned: int = 0
    overdue_count: int = 0
    total_amount: float = 0.0


class DepartmentPerformanceOut(BaseModel):
    departments: list[DepartmentPerformanceRow] = Field(default_factory=list)
