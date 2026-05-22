from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class WorkflowDefinitionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    form_schema: dict = Field(default_factory=dict)
    steps: list = Field(default_factory=list)
    routing_rules: list = Field(default_factory=list)
    settings: dict = Field(default_factory=dict)


class WorkflowDefinitionUpdate(BaseModel):
    name: str | None = None
    form_schema: dict | None = None
    steps: list | None = None
    routing_rules: list | None = None
    settings: dict | None = None


class WorkflowDefinitionOut(BaseModel):
    id: UUID
    company_id: UUID
    family_id: UUID
    name: str
    version: int
    status: str
    form_schema: dict
    steps: list
    routing_rules: list
    settings: dict
    ai_generated: bool = False
    ai_prompt: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PublishRequest(BaseModel):
    confirm_preview: bool = False
    test_completed: bool = False
    change_summary_note: str | None = None


class WorkflowPreview(BaseModel):
    id: str
    name: str
    version: int
    status: str
    ai_generated: bool
    form_fields: list
    steps: list
    routing_rules: list
    settings: dict
    gaps: list[str]
    ready_to_publish: bool


class PublishPreview(BaseModel):
    change_summary: str
    current: dict
    previous: dict | None = None


class WorkflowVersionOut(BaseModel):
    id: UUID
    version: int
    change_summary: str | None
    published_at: datetime
    workflow_definition_id: UUID | None

    model_config = {"from_attributes": True}


class WorkflowDefinitionSummary(BaseModel):
    id: UUID
    name: str
    version: int
    status: str

    model_config = {"from_attributes": True}


class WorkflowDefinitionListOut(BaseModel):
    """List item including form schema (required for submit UI)."""

    id: UUID
    name: str
    version: int
    status: str
    form_schema: dict = Field(default_factory=dict)
    settings: dict = Field(default_factory=dict)

    model_config = {"from_attributes": True}


class SimulationRequest(BaseModel):
    data: dict = Field(default_factory=dict)


class SimulationResult(BaseModel):
    steps_traversed: list[str]
    final_status: str
    routing_applied: list[str] = Field(default_factory=list)


class WorkflowEventOut(BaseModel):
    id: UUID
    event_type: str
    actor_user_id: UUID | None
    payload: dict
    created_at: datetime
    workflow_definition_id: UUID | None = None
    instance_id: UUID | None = None

    model_config = {"from_attributes": True}
