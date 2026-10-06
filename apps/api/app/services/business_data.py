"""Validate/coerce records against a business entity's typed fields (Phase C).

The low-code data model stores records as JSON; this enforces the entity's schema
on write (required, types, select options), mirroring the workflow form validator.
Relationships are a field of type ``relation`` whose value is a related record id.
"""

from __future__ import annotations

import re

FIELD_TYPES = {"text", "textarea", "number", "date", "boolean", "select", "relation"}


class BusinessDataError(ValueError):
    pass


def slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", (name or "").strip().lower()).strip("_")
    return (base or "entity")[:80]


def normalize_fields(fields: list) -> list[dict]:
    """Clean an entity's field definitions; drop malformed ones."""
    out: list[dict] = []
    seen: set[str] = set()
    for f in fields or []:
        if not isinstance(f, dict):
            continue
        key = slugify(f.get("key") or f.get("label") or "")
        if not key or key in seen:
            continue
        ftype = f.get("type") if f.get("type") in FIELD_TYPES else "text"
        clean = {
            "key": key,
            "type": ftype,
            "label": f.get("label") or key.replace("_", " ").title(),
            "required": bool(f.get("required")),
        }
        if ftype == "select":
            clean["options"] = [str(o) for o in (f.get("options") or [])]
        if ftype == "relation":
            clean["entity_slug"] = f.get("entity_slug") or ""
        seen.add(key)
        out.append(clean)
    return out


def _coerce_number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    s = str(value).strip()
    if not s:
        return None
    try:
        n = float(s) if "." in s else int(s)
        return int(n) if isinstance(n, float) and n.is_integer() else n
    except ValueError:
        return None


def validate_record(fields: list[dict], data: dict) -> dict:
    """Return a cleaned record dict validated against the entity fields, or raise."""
    data = data or {}
    out: dict = {}
    for field in fields or []:
        key, ftype = field.get("key"), field.get("type")
        if not key:
            continue
        raw = data.get(key)
        missing = raw is None or raw == ""
        if field.get("required") and missing:
            raise BusinessDataError(f"'{field.get('label', key)}' is required")
        if missing:
            continue
        if ftype == "number":
            n = _coerce_number(raw)
            if n is None:
                raise BusinessDataError(f"'{field.get('label', key)}' must be a number")
            out[key] = n
        elif ftype == "boolean":
            out[key] = bool(raw) if not isinstance(raw, str) else raw.strip().lower() in ("1", "true", "yes", "on")
        elif ftype == "select":
            if field.get("options") and str(raw) not in field["options"]:
                raise BusinessDataError(f"'{field.get('label', key)}' must be one of: {', '.join(field['options'])}")
            out[key] = str(raw)
        else:  # text, textarea, date, relation → stored as-is (string)
            out[key] = raw
    return out


if __name__ == "__main__":  # self-check: schema enforcement
    fields = normalize_fields([
        {"label": "Full Name", "type": "text", "required": True},
        {"key": "amount", "type": "number"},
        {"key": "tier", "type": "select", "options": ["gold", "silver"]},
        {"key": "owner", "type": "relation", "entity_slug": "customer"},
        {"key": "bad", "type": "nonsense"},   # → coerced to text
    ])
    keys = {f["key"]: f["type"] for f in fields}
    assert keys == {"full_name": "text", "amount": "number", "tier": "select", "owner": "relation", "bad": "text"}, keys

    rec = validate_record(fields, {"full_name": "Pat", "amount": "500", "tier": "gold", "owner": "rec-1"})
    assert rec == {"full_name": "Pat", "amount": 500, "tier": "gold", "owner": "rec-1"}, rec
    for bad in ({"amount": "x"}, {"full_name": "A", "tier": "bronze"}, {"amount": 1}):  # bad num / bad select / missing required
        try:
            validate_record(fields, bad)
            raise AssertionError(f"should have failed: {bad}")
        except BusinessDataError:
            pass
    print("business_data self-check OK")
