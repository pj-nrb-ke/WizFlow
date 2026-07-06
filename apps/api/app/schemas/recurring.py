from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class RecurringActivityCreate(BaseModel):
    name: str
    description: str | None = None
    # Recurrence: "every {interval} {freq}, on {by_*} at {at_hour}"
    freq: str = "monthly"  # weekly | monthly | yearly
    interval: int = 1
    by_weekday: int | None = None  # 0=Mon..6=Sun (weekly)
    by_monthday: int | None = None  # 1..31 (monthly/yearly)
    by_month: int | None = None  # 1..12 (yearly)
    at_hour: int = 9
    timezone: str = "UTC"
    start_date: date
    end_date: date | None = None
    # What happens
    completion_mode: str = "acknowledge"  # acknowledge | submit_workflow
    workflow_definition_id: UUID | None = None
    # Recipients
    recipient_user_ids: list[UUID] = Field(default_factory=list)
    recipient_group_ids: list[UUID] = Field(default_factory=list)
    # Nagging
    remind_enabled: bool = True
    remind_interval_days: int = 1
    remind_max_count: int | None = 10
    remind_window_days: int | None = None
    # Escalation
    escalate_after_count: int | None = None
    supervisor_user_id: UUID | None = None


class RecurringActivityUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    freq: str | None = None
    interval: int | None = None
    by_weekday: int | None = None
    by_monthday: int | None = None
    by_month: int | None = None
    at_hour: int | None = None
    timezone: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    completion_mode: str | None = None
    workflow_definition_id: UUID | None = None
    recipient_user_ids: list[UUID] | None = None
    recipient_group_ids: list[UUID] | None = None
    remind_enabled: bool | None = None
    remind_interval_days: int | None = None
    remind_max_count: int | None = None
    remind_window_days: int | None = None
    escalate_after_count: int | None = None
    supervisor_user_id: UUID | None = None
    is_active: bool | None = None


class RecurringActivityOut(BaseModel):
    id: UUID
    name: str
    description: str | None
    freq: str
    interval: int
    by_weekday: int | None
    by_monthday: int | None
    by_month: int | None
    at_hour: int
    timezone: str
    start_date: date
    end_date: date | None
    completion_mode: str
    workflow_definition_id: UUID | None
    workflow_name: str | None = None
    recipient_user_ids: list[UUID]
    recipient_group_ids: list[UUID]
    remind_enabled: bool
    remind_interval_days: int
    remind_max_count: int | None
    remind_window_days: int | None
    escalate_after_count: int | None
    supervisor_user_id: UUID | None
    is_active: bool
    last_run_at: datetime | None
    created_at: datetime
    schedule_summary: str = ""


class ObligationOut(BaseModel):
    id: UUID
    activity_id: UUID
    activity_name: str
    cycle_id: UUID
    due_date: date
    period_label: str
    user_id: UUID
    user_name: str
    status: str
    completed_at: datetime | None = None
    reminder_count: int = 0
    escalated_at: datetime | None = None
    completion_mode: str = "acknowledge"
    workflow_definition_id: UUID | None = None


class CycleOption(BaseModel):
    id: UUID
    due_date: date
    period_label: str


class ComplianceSummaryOut(BaseModel):
    activity_id: UUID
    activity_name: str
    cycle_id: UUID | None = None
    due_date: date | None = None
    period_label: str = ""
    total: int = 0
    submitted: int = 0
    outstanding: int = 0
    compliance_pct: float = 0.0
    rows: list[ObligationOut] = Field(default_factory=list)
    cycles: list[CycleOption] = Field(default_factory=list)
