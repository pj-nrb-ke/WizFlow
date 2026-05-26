from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class MasterDataEntryOut(BaseModel):
    id: UUID
    category: str
    code: str
    label: str
    meta: dict = Field(default_factory=dict)
    is_active: bool

    model_config = {"from_attributes": True}


class MasterDataEntryCreate(BaseModel):
    category: str = Field(min_length=1, max_length=50)
    code: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=200)
    meta: dict = Field(default_factory=dict)


class MasterDataEntryUpdate(BaseModel):
    label: str | None = None
    meta: dict | None = None
    is_active: bool | None = None


class RequestDraftOut(BaseModel):
    id: UUID
    workflow_definition_id: UUID
    workflow_name: str
    data: dict
    updated_at: datetime

    model_config = {"from_attributes": True}


class RequestDraftSave(BaseModel):
    workflow_definition_id: UUID
    data: dict = Field(default_factory=dict)


class SavedReportViewOut(BaseModel):
    id: UUID
    name: str
    report_type: str
    filters: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class SavedReportViewCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    report_type: str = Field(min_length=1, max_length=40)
    filters: dict = Field(default_factory=dict)


class DelegationOut(BaseModel):
    id: UUID
    user_id: UUID
    delegate_user_id: UUID
    delegate_name: str
    starts_at: datetime
    ends_at: datetime
    is_active: bool


class DelegationCreate(BaseModel):
    delegate_user_id: UUID
    starts_at: datetime
    ends_at: datetime


class WizardQuestionsOut(BaseModel):
    questions: list[dict]
    initial_hint: str


class WizardFinalizeIn(BaseModel):
    description: str
    answers: dict = Field(default_factory=dict)


class WorkflowTuneIn(BaseModel):
    instruction: str = Field(min_length=3)


class ComplianceOut(BaseModel):
    total_open: int
    missing_documents: int
    overdue_without_action: int
    returned_without_resubmit: int
    policy_gaps: list[dict]
    generated_at: datetime
