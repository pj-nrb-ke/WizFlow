"""Permission catalog (code-defined) + built-in role defaults.

Permissions are stable capability keys the code enforces; roles — built-in and
custom — are data that compose them. A built-in role's powers come from
BUILTIN_DEFAULTS by slug; a custom role stores its own list in roles.permissions.

The six keys below map 1:1 onto the app's existing access gates, and the built-in
defaults reproduce today's behaviour exactly (company_admin = everything;
manager = build/operate/insight but not users or integrations).
"""

from __future__ import annotations

WORKFLOWS_MANAGE = "workflows.manage"       # build/publish workflows, BPMN, AI, templates, forms, master data
CHECKLISTS_MANAGE = "checklists.manage"     # manage checklists
AUTOMATION_MANAGE = "automation.manage"     # reminders + recurring schedules
ANALYTICS_VIEW = "analytics.view"           # analytics, reports, KPIs
USERS_MANAGE = "users.manage"               # users, roles, invitations, departments/branches, company settings
INTEGRATIONS_MANAGE = "integrations.manage"  # API keys, webhooks

# Catalog for the admin UI (key, label, group).
CATALOG: list[dict] = [
    {"key": WORKFLOWS_MANAGE, "label": "Build & publish workflows", "group": "Build"},
    {"key": CHECKLISTS_MANAGE, "label": "Manage checklists", "group": "Operate"},
    {"key": AUTOMATION_MANAGE, "label": "Manage reminders & schedules", "group": "Operate"},
    {"key": ANALYTICS_VIEW, "label": "View analytics & reports", "group": "Insight"},
    {"key": USERS_MANAGE, "label": "Manage users, roles & company settings", "group": "Admin"},
    {"key": INTEGRATIONS_MANAGE, "label": "Manage integrations (API keys, webhooks)", "group": "Admin"},
]
ALL_PERMISSIONS: frozenset[str] = frozenset(p["key"] for p in CATALOG)

BUILTIN_DEFAULTS: dict[str, frozenset[str]] = {
    "company_admin": ALL_PERMISSIONS,
    "manager": frozenset({WORKFLOWS_MANAGE, CHECKLISTS_MANAGE, AUTOMATION_MANAGE, ANALYTICS_VIEW}),
    "approver": frozenset(),    # approval is assignee-based, not a role gate
    "originator": frozenset(),  # base user: submit requests only
}


def is_builtin(slug: str) -> bool:
    return slug in BUILTIN_DEFAULTS


def permissions_for_role(slug: str, stored: list[str] | None) -> frozenset[str]:
    """Effective permissions for a role: its explicit stored list, else the built-in
    default for that slug, else empty. Unknown keys are ignored."""
    if stored:
        return frozenset(p for p in stored if p in ALL_PERMISSIONS)
    return BUILTIN_DEFAULTS.get(slug, frozenset())


if __name__ == "__main__":  # self-check: built-in defaults reproduce today's gates
    admin = permissions_for_role("company_admin", None)
    mgr = permissions_for_role("manager", None)
    appr = permissions_for_role("approver", None)
    assert admin == ALL_PERMISSIONS
    assert WORKFLOWS_MANAGE in mgr and ANALYTICS_VIEW in mgr
    assert USERS_MANAGE not in mgr and INTEGRATIONS_MANAGE not in mgr  # manager ≠ admin
    assert appr == frozenset()
    # a custom role uses its stored list (not a default)
    custom = permissions_for_role("finance_reviewer", [ANALYTICS_VIEW, "bogus.perm"])
    assert custom == frozenset({ANALYTICS_VIEW})  # unknown key dropped
    print("permissions self-check OK")
