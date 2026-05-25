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
    reference_number: str | None = None
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
    assignment_mode: str | None = None
    needs_claim: bool = False
    can_act: bool = False
    can_approve: bool = False
    is_originator: bool = False
    step_sequence: list[str]
    ui_theme: str = "corporate"
    form_layout: str = "stacked"
    created_at: datetime
    updated_at: datetime


class InboxItem(BaseModel):
    request_id: UUID
    reference_number: str | None = None
    workflow_name: str
    step_name: str
    step_id: str
    submitted_at: datetime | None
    originator_name: str
    amount_preview: str | None = None
    needs_claim: bool = False


class NotificationCountOut(BaseModel):
    unread: int
    inbox: int


class PublicApprovalView(BaseModel):
    reference_number: str | None = None
    workflow_name: str
    step_name: str
    originator_name: str
    submitted_at: datetime | None
    request_preview: dict
    can_approve: bool = True
    can_reject: bool = True


class PublicApprovalDecide(BaseModel):
    action: str
    comment: str | None = None


class WorkflowEventOut(BaseModel):
    id: UUID
    event_type: str
    event_label: str | None = None
    actor_user_id: UUID | None
    actor_name: str | None = None
    payload: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class MisActionRow(BaseModel):
    reference_number: str | None
    workflow_name: str
    request_status: str
    event_type: str
    event_label: str
    action_at: datetime
    actor_name: str | None
    step_id: str | None = None
    comment: str | None = None


class NotificationOut(BaseModel):
    id: UUID
    title: str
    body: str
    read: bool
    created_at: datetime

    model_config = {"from_attributes": True}
