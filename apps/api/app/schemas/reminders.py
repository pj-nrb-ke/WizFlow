from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ReminderRuleCreate(BaseModel):
    name: str
    description: str | None = None
    days_of_week: list[int] = Field(default_factory=list)
    send_hour: int = 8
    assignee_user_ids: list[UUID] = Field(default_factory=list)
    assignee_group_ids: list[UUID] = Field(default_factory=list)


class ReminderRuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    days_of_week: list[int] | None = None
    send_hour: int | None = None
    assignee_user_ids: list[UUID] | None = None
    assignee_group_ids: list[UUID] | None = None
    is_active: bool | None = None


class ReminderRuleOut(BaseModel):
    id: UUID
    name: str
    description: str | None
    days_of_week: list[int]
    send_hour: int
    assignee_user_ids: list[UUID]
    assignee_group_ids: list[UUID]
    is_active: bool
    created_at: datetime


class ReminderOccurrenceOut(BaseModel):
    id: UUID
    rule_id: UUID
    rule_name: str
    user_id: UUID
    user_name: str
    due_date: date
    status: str
    acknowledged_at: datetime | None = None


class ComplianceReportRow(BaseModel):
    occurrence_id: UUID
    rule_id: UUID
    rule_name: str
    user_id: UUID
    user_name: str
    due_date: date
    status: str
    acknowledged_at: datetime | None = None


class ComplianceReportOut(BaseModel):
    rows: list[ComplianceReportRow] = Field(default_factory=list)
    total: int = 0
    done: int = 0
    missed: int = 0
    pending: int = 0
    compliance_pct: float = 0.0
