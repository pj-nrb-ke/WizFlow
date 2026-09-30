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


class BpmnDiagramSummary(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BpmnDiagramOut(BpmnDiagramSummary):
    bpmn_xml: str
