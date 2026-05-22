from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class RequestSubmit(BaseModel):
    data: dict = Field(default_factory=dict)


class RequestUpdate(BaseModel):
    data: dict = Field(default_factory=dict)


class ApprovalAction(BaseModel):
    comment: str | None = None


class AttachmentOut(BaseModel):
    id: UUID
    filename: str
    content_type: str | None
    size_bytes: int
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkflowInstanceSummary(BaseModel):
    id: UUID
    workflow_name: str
    status: str
    current_step: str | None = None
    current_step_name: str | None = None
    submitted_at: datetime | None = None

    model_config = {"from_attributes": True}


class WorkflowInstanceOut(WorkflowInstanceSummary):
    workflow_definition_id: UUID
    originator_user_id: UUID | None
    originator_name: str | None = None
    request_data: dict
    assignees: list[dict]
    step_sequence: list[str]
    created_at: datetime
    updated_at: datetime


class InboxItem(BaseModel):
    request_id: UUID
    workflow_name: str
    step_name: str
    step_id: str
    submitted_at: datetime | None
    originator_name: str
    amount_preview: str | None = None


class WorkflowEventOut(BaseModel):
    id: UUID
    event_type: str
    actor_user_id: UUID | None
    actor_name: str | None = None
    payload: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationOut(BaseModel):
    id: UUID
    title: str
    body: str
    read: bool
    created_at: datetime

    model_config = {"from_attributes": True}
