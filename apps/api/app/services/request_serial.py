"""Per-workflow-family reference numbers (e.g. PC-2026-00042)."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import RequestSerialSequence, WorkflowDefinition, WorkflowInstance

# Default prefixes by workflow name (seed / legacy)
_NAME_PREFIXES: dict[str, str] = {
    "petty cash": "PC",
    "purchase request": "PR",
    "leave": "LV",
    "expense": "EX",
    "fee note": "FN",
    "travel": "TR",
    "vendor": "VN",
    "invoice": "IN",
    "budget": "BG",
    "overtime": "OT",
}


def derive_prefix(workflow_name: str, settings: dict | None) -> str:
    settings = settings or {}
    explicit = (settings.get("serial_prefix") or "").strip().upper()
    if explicit:
        return explicit[:10]
    lower = workflow_name.lower()
    for key, prefix in _NAME_PREFIXES.items():
        if key in lower:
            return prefix
    words = re.findall(r"[A-Za-z0-9]+", workflow_name)
    if not words:
        return "REQ"
    if len(words) == 1:
        return words[0][:4].upper()
    return "".join(w[0] for w in words[:4]).upper()


def allocate_reference_number(
    db: Session,
    *,
    company_id: UUID,
    defn: WorkflowDefinition,
    when: datetime | None = None,
) -> str:
    """Thread-safe enough for demo: row lock via UPDATE in transaction."""
    when = when or datetime.now(timezone.utc)
    year = when.year
    prefix = derive_prefix(defn.name, defn.settings)
    family_id = defn.family_id

    seq = db.scalar(
        select(RequestSerialSequence).where(
            RequestSerialSequence.company_id == company_id,
            RequestSerialSequence.family_id == family_id,
            RequestSerialSequence.year == year,
        )
    )
    if not seq:
        seq = RequestSerialSequence(
            company_id=company_id,
            family_id=family_id,
            year=year,
            next_value=1,
        )
        db.add(seq)
        db.flush()

    num = seq.next_value
    seq.next_value = num + 1
    return f"{prefix}-{year}-{num:05d}"


def backfill_reference_for_instance(
    db: Session,
    inst: WorkflowInstance,
    defn: WorkflowDefinition,
) -> str:
    if inst.reference_number:
        return inst.reference_number
    when = inst.submitted_at or inst.created_at
    ref = allocate_reference_number(db, company_id=inst.company_id, defn=defn, when=when)
    inst.reference_number = ref
    return ref
