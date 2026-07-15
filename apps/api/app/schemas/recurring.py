from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ── Schedules: the reusable "WHEN" (recurrence + name only) ──────────────────


class ScheduleCreate(BaseModel):
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


class ScheduleUpdate(BaseModel):
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
    is_active: bool | None = None


# ── Targets: the "WHAT" attached to a schedule (many per schedule) ───────────


class TargetCreate(BaseModel):
    kind: str  # workflow | acknowledge | checklist
    name: str | None = None  # optional label
    workflow_definition_id: UUID | None = None
    checklist_id: UUID | None = None
    # Recipients (each gets their own obligation for workflow/acknowledge kinds)
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


class TargetUpdate(BaseModel):
    kind: str | None = None
    name: str | None = None
    workflow_definition_id: UUID | None = None
    checklist_id: UUID | None = None
    recipient_user_ids: list[UUID] | None = None
    recipient_group_ids: list[UUID] | None = None
    remind_enabled: bool | None = None
    remind_interval_days: int | None = None
    remind_max_count: int | None = None
    remind_window_days: int | None = None
    escalate_after_count: int | None = None
    supervisor_user_id: UUID | None = None
    is_active: bool | None = None


class TargetOut(BaseModel):
    id: UUID
    schedule_id: UUID
    kind: str
    name: str | None = None
    target_name: str = ""  # resolved workflow / checklist name (or the label)
    workflow_definition_id: UUID | None = None
    checklist_id: UUID | None = None
    recipient_user_ids: list[UUID]
    recipient_group_ids: list[UUID]
    remind_enabled: bool
    remind_interval_days: int
    remind_max_count: int | None
    remind_window_days: int | None
    escalate_after_count: int | None
    supervisor_user_id: UUID | None
    is_active: bool
    created_at: datetime


class ScheduleOut(BaseModel):
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
    is_active: bool
    last_run_at: datetime | None
    created_at: datetime
    schedule_summary: str = ""
    targets: list[TargetOut] = Field(default_factory=list)


# ── Obligations + compliance (per target) ────────────────────────────────────


class ObligationOut(BaseModel):
    id: UUID
    schedule_id: UUID
    schedule_name: str
    target_id: UUID
    run_id: UUID
    due_date: date
    period_label: str
    user_id: UUID
    user_name: str
    status: str
    completed_at: datetime | None = None
    reminder_count: int = 0
    escalated_at: datetime | None = None
    completion_mode: str = "acknowledge"  # derived from target.kind
    workflow_definition_id: UUID | None = None


class RunOption(BaseModel):
    id: UUID
    due_date: date
    period_label: str


class ComplianceSummaryOut(BaseModel):
    target_id: UUID
    target_name: str
    schedule_name: str
    run_id: UUID | None = None
    due_date: date | None = None
    period_label: str = ""
    total: int = 0
    submitted: int = 0
    outstanding: int = 0
    compliance_pct: float = 0.0
    rows: list[ObligationOut] = Field(default_factory=list)
    runs: list[RunOption] = Field(default_factory=list)
