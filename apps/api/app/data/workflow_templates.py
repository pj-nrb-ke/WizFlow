"""Prebuilt office workflow templates (Phase 1)."""

from __future__ import annotations

MANAGER_STEP = {
    "id": "step_manager",
    "name": "Manager Approval",
    "type": "approval",
    "assignee": {"type": "role", "value": "manager"},
}
FINANCE_STEP = {
    "id": "step_finance",
    "name": "Finance Approval",
    "type": "approval",
    "assignee": {"type": "role", "value": "company_admin"},
}
DEFAULT_STEPS = [MANAGER_STEP, FINANCE_STEP]


def _amount_fields(*extra: tuple[str, str, str]) -> list[dict]:
    base = [
        {"key": "amount", "type": "number", "label": "Amount", "required": True},
        {"key": "purpose", "type": "text", "label": "Purpose", "required": True},
        {"key": "department", "type": "text", "label": "Department", "required": True},
    ]
    for key, ftype, label in extra:
        base.append({"key": key, "type": ftype, "label": label, "required": True})
    return base


WORKFLOW_TEMPLATES: list[dict] = [
    {
        "id": "petty_cash",
        "name": "Petty Cash Request",
        "category": "Finance",
        "description": "Small cash reimbursements with manager and finance approval above limits.",
        "form_schema": {"fields": _amount_fields()},
        "steps": DEFAULT_STEPS,
        "routing_rules": [
            {"when": {"field": "amount", "op": "gt", "value": 5000}, "skip_to": "step_finance"}
        ],
        "settings": {"sla_hours": 48, "serial_prefix": "PC"},
    },
    {
        "id": "purchase_request",
        "name": "Purchase Request",
        "category": "Procurement",
        "description": "Request goods or services with amount-based routing to finance.",
        "form_schema": {
            "fields": [
                {"key": "amount", "type": "number", "label": "Total amount", "required": True},
                {"key": "item_description", "type": "text", "label": "Item / service", "required": True},
                {"key": "vendor", "type": "text", "label": "Vendor", "required": True},
                {"key": "department", "type": "text", "label": "Department", "required": True},
            ]
        },
        "steps": DEFAULT_STEPS,
        "routing_rules": [
            {"when": {"field": "amount", "op": "gt", "value": 10000}, "skip_to": "step_finance"}
        ],
        "settings": {"sla_hours": 72, "serial_prefix": "PR"},
    },
    {
        "id": "leave_request",
        "name": "Leave Request",
        "category": "HR",
        "description": "Employee leave application with manager approval.",
        "form_schema": {
            "fields": [
                {"key": "start_date", "type": "date", "label": "Start date", "required": True},
                {"key": "end_date", "type": "date", "label": "End date", "required": True},
                {"key": "leave_type", "type": "text", "label": "Leave type", "required": True},
                {"key": "reason", "type": "textarea", "label": "Reason", "required": False},
            ]
        },
        "steps": [MANAGER_STEP],
        "routing_rules": [],
        "settings": {"sla_hours": 24, "serial_prefix": "LV"},
    },
    {
        "id": "overtime_request",
        "name": "Overtime Request",
        "category": "HR",
        "description": "Request overtime hours with manager sign-off.",
        "form_schema": {
            "fields": [
                {"key": "hours", "type": "number", "label": "Overtime hours", "required": True},
                {"key": "date", "type": "date", "label": "Date", "required": True},
                {"key": "reason", "type": "text", "label": "Reason", "required": True},
                {"key": "department", "type": "text", "label": "Department", "required": True},
            ]
        },
        "steps": [MANAGER_STEP],
        "routing_rules": [],
        "settings": {"sla_hours": 24, "serial_prefix": "OT"},
    },
    {
        "id": "travel_expense",
        "name": "Travel Expense Claim",
        "category": "Finance",
        "description": "Travel reimbursement with finance review for higher amounts.",
        "form_schema": {"fields": _amount_fields(("destination", "text", "Destination"))},
        "steps": DEFAULT_STEPS,
        "routing_rules": [
            {"when": {"field": "amount", "op": "gt", "value": 8000}, "skip_to": "step_finance"}
        ],
        "settings": {"sla_hours": 48, "serial_prefix": "TR"},
    },
    {
        "id": "vendor_onboarding",
        "name": "Vendor Onboarding",
        "category": "Procurement",
        "description": "Register a new vendor with compliance and finance checks.",
        "form_schema": {
            "fields": [
                {"key": "vendor_name", "type": "text", "label": "Vendor name", "required": True},
                {"key": "amount", "type": "number", "label": "Estimated annual spend", "required": True},
                {"key": "category", "type": "text", "label": "Category", "required": True},
                {"key": "department", "type": "text", "label": "Department", "required": True},
            ]
        },
        "steps": DEFAULT_STEPS,
        "routing_rules": [
            {"when": {"field": "amount", "op": "gt", "value": 50000}, "skip_to": "step_finance"}
        ],
        "settings": {"sla_hours": 96, "serial_prefix": "VN"},
    },
    {
        "id": "contract_approval",
        "name": "Contract Approval",
        "category": "Legal",
        "description": "Review and approve contracts by value.",
        "form_schema": {
            "fields": [
                {"key": "contract_title", "type": "text", "label": "Contract title", "required": True},
                {"key": "amount", "type": "number", "label": "Contract value", "required": True},
                {"key": "counterparty", "type": "text", "label": "Counterparty", "required": True},
                {"key": "department", "type": "text", "label": "Department", "required": True},
            ]
        },
        "steps": DEFAULT_STEPS,
        "routing_rules": [
            {"when": {"field": "amount", "op": "gt", "value": 25000}, "skip_to": "step_finance"}
        ],
        "settings": {"sla_hours": 120, "serial_prefix": "CT"},
    },
    {
        "id": "it_access",
        "name": "IT Access Request",
        "category": "IT",
        "description": "Request system access with manager and IT admin approval.",
        "form_schema": {
            "fields": [
                {"key": "system_name", "type": "text", "label": "System", "required": True},
                {"key": "access_level", "type": "text", "label": "Access level", "required": True},
                {"key": "justification", "type": "textarea", "label": "Justification", "required": True},
                {"key": "department", "type": "text", "label": "Department", "required": True},
            ]
        },
        "steps": DEFAULT_STEPS,
        "routing_rules": [],
        "settings": {"sla_hours": 48, "serial_prefix": "IT"},
    },
    {
        "id": "equipment_request",
        "name": "Equipment Request",
        "category": "Operations",
        "description": "Request office equipment with cost-based routing.",
        "form_schema": {
            "fields": [
                {"key": "item", "type": "text", "label": "Equipment item", "required": True},
                {"key": "amount", "type": "number", "label": "Estimated cost", "required": True},
                {"key": "department", "type": "text", "label": "Department", "required": True},
            ]
        },
        "steps": DEFAULT_STEPS,
        "routing_rules": [
            {"when": {"field": "amount", "op": "gt", "value": 15000}, "skip_to": "step_finance"}
        ],
        "settings": {"sla_hours": 72, "serial_prefix": "EQ"},
    },
    {
        "id": "cheque_collection",
        "name": "Cheque Collection",
        "category": "Finance",
        "description": "Track cheque collection and handover (placeholder template — customize fields).",
        "form_schema": {
            "fields": [
                {"key": "cheque_number", "type": "text", "label": "Cheque number", "required": True},
                {"key": "bank", "type": "text", "label": "Bank", "required": True},
                {"key": "amount", "type": "number", "label": "Amount", "required": True},
                {"key": "payee", "type": "text", "label": "Payee", "required": True},
            ]
        },
        "steps": [MANAGER_STEP],
        "routing_rules": [],
        "settings": {"sla_hours": 24, "serial_prefix": "CH"},
    },
    {
        "id": "month_end_report",
        "name": "Month-End Report Submission",
        "category": "Finance",
        "description": "Submit periodic month-end reports (placeholder — add your checklist fields).",
        "form_schema": {
            "fields": [
                {"key": "report_period", "type": "text", "label": "Report period", "required": True},
                {"key": "department", "type": "text", "label": "Department", "required": True},
                {"key": "summary", "type": "textarea", "label": "Summary", "required": True},
            ]
        },
        "steps": [MANAGER_STEP, FINANCE_STEP],
        "routing_rules": [],
        "settings": {"sla_hours": 72, "serial_prefix": "ME"},
    },
]


def get_template(template_id: str) -> dict | None:
    for t in WORKFLOW_TEMPLATES:
        if t["id"] == template_id:
            return t
    return None


def list_template_summaries() -> list[dict]:
    return [
        {
            "id": t["id"],
            "name": t["name"],
            "category": t["category"],
            "description": t["description"],
        }
        for t in WORKFLOW_TEMPLATES
    ]
