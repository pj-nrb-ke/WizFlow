from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class BpmnDiagramCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    # If omitted, the server seeds a minimal empty diagram.
    bpmn_xml: str | None = None


class BpmnDiagramUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    bpmn_xml: str | None = None
    bindings: dict | None = None


class BpmnDiagramSummary(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BpmnDiagramOut(BpmnDiagramSummary):
    bpmn_xml: str
    bindings: dict | None = None


class CompiledWorkflowOut(BaseModel):
    """Preview of compiling a diagram into a runnable workflow (A2)."""
    ok: bool
    name: str
    form_schema: dict = Field(default_factory=dict)
    steps: list[dict] = Field(default_factory=list)
    routing_rules: list[dict] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class PublishAsAppOut(BaseModel):
    """Result of turning a diagram into a draft workflow app (A3)."""
    workflow_id: UUID
    name: str
    warnings: list[str] = Field(default_factory=list)


class AssistantIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class AssistantOut(BaseModel):
    """Conversational builder reply + the updated canvas state (A4)."""
    reply: str
    name: str
    bpmn_xml: str
    bindings: dict = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    source: str = "template"
