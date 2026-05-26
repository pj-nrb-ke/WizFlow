from uuid import UUID

from pydantic import BaseModel, Field


class HealthIssue(BaseModel):
    severity: str
    message: str


class HealthCheckOut(BaseModel):
    issues: list[HealthIssue]
    ok: bool


class NotificationPreferences(BaseModel):
    email: bool = True
    in_app: bool = True
    push: bool = True
    whatsapp: bool = False


class NotificationPreferencesUpdate(BaseModel):
    email: bool | None = None
    in_app: bool | None = None
    push: bool | None = None
    whatsapp: bool | None = None


class CompanyBranding(BaseModel):
    logo_url: str | None = None
    brand_color: str | None = None
    display_name: str | None = None


class CompanyBrandingUpdate(BaseModel):
    logo_url: str | None = None
    brand_color: str | None = None
    display_name: str | None = None


class SetupStatusOut(BaseModel):
    steps: dict[str, bool]
    complete: bool
    percent: float


class WorkflowTemplateSummary(BaseModel):
    id: str
    name: str
    category: str
    description: str


class WorkflowTemplateCloneOut(BaseModel):
    workflow_id: UUID
    name: str
    status: str
