"""Pydantic schemas for the Checklists module."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ── Create / update ─────────────────────────────────────────────────────────────


class ChecklistTaskCreate(BaseModel):
    title: str
    description: str | None = None
    assignee_user_id: UUID | None = None
    due_date: date | None = None
    priority: str = "normal"
    weight: int = 1
    attachment_required: bool = False
    order_index: int = 0


class ChecklistCreate(BaseModel):
    name: str
    description: str | None = None
    category: str | None = None
    timezone: str = "UTC"
    start_date: date
    due_date: date
    recurrence: str = "none"
    recurrence_config: dict = Field(default_factory=dict)
    carry_over: str = "reset"
    verification_required: bool = False
    verifier_user_id: UUID | None = None
    completion_rule: str = "all"
    completion_threshold: int = 100
    tasks: list[ChecklistTaskCreate] = Field(default_factory=list)


class ChecklistUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    status: str | None = None
    verification_required: bool | None = None
    verifier_user_id: UUID | None = None


class ReassignBody(BaseModel):
    assignee_user_id: UUID
    reason: str | None = None


class CompleteBody(BaseModel):
    note: str | None = None


class RejectBody(BaseModel):
    reason: str


class SkipBody(BaseModel):
    reason: str


# ── Output ──────────────────────────────────────────────────────────────────────


class TaskAttachmentOut(BaseModel):
    id: UUID
    original_filename: str
    size_bytes: int
    created_at: datetime


class ChecklistTaskOut(BaseModel):
    id: UUID
    checklist_id: UUID
    instance_id: UUID
    checklist_name: str
    title: str
    description: str | None
    assignee_user_id: UUID | None
    assignee_name: str | None
    due_date: date | None
    priority: str
    weight: int
    attachment_required: bool
    order_index: int
    status: str
    completed_at: datetime | None
    completion_channel: str | None
    approved_at: datetime | None
    reject_reason: str | None
    verification_required: bool
    timezone: str
    link: str | None = None
    attachments: list[TaskAttachmentOut] = Field(default_factory=list)


class ChecklistSummary(BaseModel):
    id: UUID
    name: str
    description: str | None
    category: str | None
    status: str
    timezone: str
    start_date: date
    due_date: date
    recurrence: str
    verification_required: bool
    task_count: int
    done_count: int
    progress_pct: int
    created_at: datetime


class ChecklistDetail(ChecklistSummary):
    instance_id: UUID | None
    completion_rule: str
    completion_threshold: int
    carry_over: str
    verifier_user_id: UUID | None
    tasks: list[ChecklistTaskOut] = Field(default_factory=list)


class TaskLibraryRow(BaseModel):
    checklist_id: UUID
    checklist_name: str
    task_id: UUID
    title: str
    description: str | None


# ── Report (completion-vs-due analytics) ────────────────────────────────────────


class ReportRow(BaseModel):
    task_id: UUID
    checklist_name: str
    title: str
    assignee_name: str | None
    due_date: date | None
    completed_on: date | None
    status: str
    outcome: str  # on_time | early | late | pending | overdue | skipped
    variance_days: int | None


class ReportUserRow(BaseModel):
    user_id: UUID | None
    user_name: str
    total: int
    completed: int
    on_time: int
    late: int
    on_time_pct: float
    avg_variance_days: float | None


class ChecklistReport(BaseModel):
    rows: list[ReportRow]
    by_user: list[ReportUserRow]
    total: int
    completed: int
    on_time: int
    late: int
    on_time_pct: float


# ── No-login (token) task view ──────────────────────────────────────────────────


class PublicTaskView(BaseModel):
    title: str
    description: str | None
    checklist_name: str
    company_name: str
    assignee_name: str | None
    due_date: date | None
    status: str
    attachment_required: bool
    attachments: list[TaskAttachmentOut] = Field(default_factory=list)
