"""Shared constants — keep in sync with ADR-003 and OpenAPI enums."""

ROLE_SUPER_ADMIN = "super_admin"
ROLE_COMPANY_ADMIN = "company_admin"
ROLE_MANAGER = "manager"
ROLE_ORIGINATOR = "originator"
ROLE_APPROVER = "approver"
ROLE_AUDITOR = "auditor"
ROLE_KPI_VIEWER = "kpi_viewer"

DEFAULT_ROLES = (
    ROLE_COMPANY_ADMIN,
    ROLE_MANAGER,
    ROLE_ORIGINATOR,
    ROLE_APPROVER,
)

WORKFLOW_EVENT_TYPES = (
    "workflow.published",
    "request.submitted",
    "step.started",
    "step.approved",
    "step.rejected",
    "step.returned",
    "comment.added",
    "file.uploaded",
    "step.delegated",
    "workflow.completed",
)

INSTANCE_STATUSES = (
    "draft",
    "submitted",
    "in_progress",
    "approved",
    "rejected",
    "returned",
)

DEFINITION_STATUSES = ("draft", "published", "archived")
