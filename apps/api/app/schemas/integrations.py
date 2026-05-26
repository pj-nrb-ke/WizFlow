from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    service_user_id: UUID
    scopes: list[str] = Field(default_factory=lambda: ["requests:read", "requests:write"])


class ApiKeyOut(BaseModel):
    id: UUID
    name: str
    key_prefix: str
    scopes: list[str]
    service_user_id: UUID
    is_active: bool
    created_at: datetime
    last_used_at: datetime | None

    model_config = {"from_attributes": True}


class ApiKeyCreated(ApiKeyOut):
    api_key: str


class WebhookCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    url: str = Field(..., max_length=500)
    events: list[str] = Field(default_factory=lambda: ["request.submitted", "workflow.completed"])


class WebhookOut(BaseModel):
    id: UUID
    name: str
    url: str
    events: list[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class WebhookCreated(WebhookOut):
    signing_secret: str


class WebhookDeliveryOut(BaseModel):
    id: UUID
    event_type: str
    success: bool
    status_code: int | None
    error_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SecurityAuditOut(BaseModel):
    id: UUID
    action: str
    actor_user_id: UUID | None
    resource_type: str | None
    resource_id: str | None
    ip_address: str | None
    detail: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentExtractOut(BaseModel):
    document_type: str
    fields: list[dict]
    overall_confidence: float
    requires_review: bool
    message: str


class ExternalRequestSubmit(BaseModel):
    workflow_id: UUID
    data: dict = Field(default_factory=dict)


class AnomalyFinding(BaseModel):
    type: str
    severity: str
    instance_id: str | None
    reference_number: str | None
    workflow_name: str | None
    message: str


class AnomaliesOut(BaseModel):
    findings: list[AnomalyFinding]
    generated_at: datetime


class NarrativeOut(BaseModel):
    narrative: str
    generated_at: datetime
