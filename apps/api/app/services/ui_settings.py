"""UI theme and form layout helpers."""

from __future__ import annotations

from typing import Any

WIZFLOW_UI_KEY = "__wizflow_ui"
VALID_THEMES = frozenset({"corporate", "executive", "operations", "people", "finance"})
VALID_LAYOUTS = frozenset({"stacked", "sectioned", "two-column", "highlight-amount"})


def ui_from_settings(settings: dict | None) -> dict[str, str]:
    s = settings or {}
    theme = s.get("ui_theme", "corporate")
    layout = s.get("form_layout", "stacked")
    return {
        "ui_theme": theme if theme in VALID_THEMES else "corporate",
        "form_layout": layout if layout in VALID_LAYOUTS else "stacked",
    }


def suggest_ui_for_workflow_name(name: str) -> dict[str, str]:
    n = name.lower()
    if "leave" in n or "training" in n or "overtime" in n:
        return {"ui_theme": "people", "form_layout": "sectioned"}
    if any(
        x in n
        for x in ("petty", "purchase", "travel", "expense", "vendor", "contract", "invoice")
    ):
        layout = "highlight-amount" if "petty" in n or "travel" in n else "sectioned"
        return {"ui_theme": "finance", "form_layout": layout}
    if "it " in n or "access" in n or "equipment" in n:
        return {"ui_theme": "operations", "form_layout": "two-column"}
    return {"ui_theme": "corporate", "form_layout": "stacked"}


def ui_from_instance(defn_settings: dict | None, request_data: dict | None) -> dict[str, str]:
    data = request_data or {}
    snap = data.get(WIZFLOW_UI_KEY)
    if isinstance(snap, dict) and snap.get("ui_theme"):
        theme = snap.get("ui_theme", "corporate")
        layout = snap.get("form_layout", "stacked")
        return {
            "ui_theme": theme if theme in VALID_THEMES else "corporate",
            "form_layout": layout if layout in VALID_LAYOUTS else "stacked",
        }
    return ui_from_settings(defn_settings)


def attach_ui_snapshot(data: dict[str, Any], defn_settings: dict | None) -> dict[str, Any]:
    out = dict(data)
    out[WIZFLOW_UI_KEY] = ui_from_settings(defn_settings)
    return out


def strip_ui_keys(data: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in data.items() if k != WIZFLOW_UI_KEY and not str(k).startswith("__")}
