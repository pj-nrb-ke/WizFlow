"""Workflow versioning, preview, and publish gates (P5)."""

from __future__ import annotations

import copy
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import WorkflowDefinition, WorkflowEvent, WorkflowVersionHistory
from app.services import workflow_engine


def snapshot_definition(defn: WorkflowDefinition) -> dict:
    return {
        "name": defn.name,
        "version": defn.version,
        "form_schema": defn.form_schema,
        "steps": defn.steps,
        "routing_rules": defn.routing_rules,
        "settings": defn.settings,
        "status": defn.status,
    }


def compute_change_summary(before: dict | None, after: dict) -> str:
    if not before:
        return "Initial publish."
    parts: list[str] = []
    if before.get("name") != after.get("name"):
        parts.append(f"Name: {before.get('name')} → {after.get('name')}")
    b_steps = len(before.get("steps") or [])
    a_steps = len(after.get("steps") or [])
    if b_steps != a_steps:
        parts.append(f"Approval steps: {b_steps} → {a_steps}")
    b_fields = len((before.get("form_schema") or {}).get("fields") or [])
    a_fields = len((after.get("form_schema") or {}).get("fields") or [])
    if b_fields != a_fields:
        parts.append(f"Form fields: {b_fields} → {a_fields}")
    b_rules = len(before.get("routing_rules") or [])
    a_rules = len(after.get("routing_rules") or [])
    if b_rules != a_rules:
        parts.append(f"Routing rules: {b_rules} → {a_rules}")
    return "; ".join(parts) if parts else "No structural changes detected."


def get_last_published_snapshot(db: Session, family_id: UUID, company_id: UUID) -> dict | None:
    row = db.scalar(
        select(WorkflowVersionHistory)
        .where(
            WorkflowVersionHistory.family_id == family_id,
            WorkflowVersionHistory.company_id == company_id,
        )
        .order_by(WorkflowVersionHistory.version.desc())
        .limit(1)
    )
    return row.snapshot if row else None


def build_preview(defn: WorkflowDefinition) -> dict:
    gaps: list[str] = []
    try:
        workflow_engine.validate_definition(defn)
    except workflow_engine.WorkflowValidationError as e:
        gaps.append(str(e))

    fields = (defn.form_schema or {}).get("fields") or []
    steps_out = []
    for i, step in enumerate(defn.steps or []):
        if not isinstance(step, dict):
            continue
        assignee = step.get("assignee") or {}
        steps_out.append(
            {
                "order": i + 1,
                "id": step.get("id"),
                "name": step.get("name"),
                "assignee_type": assignee.get("type"),
                "assignee_value": assignee.get("value"),
                "assignee_mode": assignee.get("mode"),
                "assignee_user_ids": assignee.get("user_ids"),
            }
        )
        atype = assignee.get("type")
        if atype == "role" and not assignee.get("value"):
            gaps.append(f"Step '{step.get('name')}' has no role assignee.")
        elif atype == "users" and not (assignee.get("user_ids") or []):
            gaps.append(f"Step '{step.get('name')}' has no named users.")
        elif not atype:
            gaps.append(f"Step '{step.get('name')}' has no assignee.")

    if not fields:
        gaps.append("Form has no fields defined.")

    tested = bool((defn.settings or {}).get("last_simulated_at"))
    if not tested:
        gaps.append("Workflow has not been tested with sample data yet.")

    return {
        "id": str(defn.id),
        "name": defn.name,
        "version": defn.version,
        "status": defn.status,
        "ai_generated": defn.ai_generated,
        "form_fields": fields,
        "steps": steps_out,
        "routing_rules": defn.routing_rules or [],
        "settings": defn.settings or {},
        "gaps": gaps,
        "ready_to_publish": len(gaps) == 0 or (len(gaps) == 1 and "not been tested" in gaps[0]),
    }


def mark_simulated(defn: WorkflowDefinition) -> None:
    settings = dict(defn.settings or {})
    settings["last_simulated_at"] = datetime.now(timezone.utc).isoformat()
    defn.settings = settings


def ensure_publish_allowed(defn: WorkflowDefinition, *, confirm_preview: bool, test_completed: bool) -> None:
    if defn.status != "draft":
        raise ValueError("Only draft workflows can be published")
    workflow_engine.validate_definition(defn)
    if not test_completed and not (defn.settings or {}).get("last_simulated_at"):
        raise ValueError("Run a test simulation before publishing")
    if not confirm_preview:
        raise ValueError("Confirm you have reviewed the workflow preview")


def archive_and_publish(
    db: Session,
    defn: WorkflowDefinition,
    *,
    company_id: UUID,
    user_id: UUID,
    change_summary: str | None = None,
) -> WorkflowDefinition:
    before = get_last_published_snapshot(db, defn.family_id, company_id)
    after = snapshot_definition(defn)
    summary = change_summary or compute_change_summary(before, after)

    db.add(
        WorkflowVersionHistory(
            company_id=company_id,
            family_id=defn.family_id,
            workflow_definition_id=defn.id,
            version=defn.version,
            snapshot=after,
            change_summary=summary,
            published_by=user_id,
        )
    )

    # Archive other published rows in same family
    others = db.scalars(
        select(WorkflowDefinition).where(
            WorkflowDefinition.family_id == defn.family_id,
            WorkflowDefinition.company_id == company_id,
            WorkflowDefinition.status == "published",
            WorkflowDefinition.id != defn.id,
        )
    )
    for o in others:
        o.status = "archived"

    defn.status = "published"
    settings = dict(defn.settings or {})
    settings["published_at"] = datetime.now(timezone.utc).isoformat()
    defn.settings = settings
    return defn


def create_new_draft_version(db: Session, defn: WorkflowDefinition, company_id: UUID) -> WorkflowDefinition:
    if defn.status != "published":
        raise ValueError("Create a new version from a published workflow only")

    max_ver = db.scalar(
        select(func.max(WorkflowDefinition.version)).where(
            WorkflowDefinition.family_id == defn.family_id,
            WorkflowDefinition.company_id == company_id,
        )
    ) or defn.version

    draft = WorkflowDefinition(
        company_id=company_id,
        family_id=defn.family_id,
        name=defn.name,
        version=int(max_ver) + 1,
        status="draft",
        form_schema=copy.deepcopy(defn.form_schema),
        steps=copy.deepcopy(defn.steps),
        routing_rules=copy.deepcopy(defn.routing_rules),
        settings=copy.deepcopy(defn.settings or {}),
        ai_generated=defn.ai_generated,
        ai_prompt=defn.ai_prompt,
    )
    draft.settings = dict(draft.settings or {})
    draft.settings.pop("published_at", None)
    draft.settings.pop("last_simulated_at", None)
    db.add(draft)
    db.flush()
    return draft


def rollback_to_version(
    db: Session,
    *,
    family_id: UUID,
    company_id: UUID,
    version: int,
) -> WorkflowDefinition:
    hist = db.scalar(
        select(WorkflowVersionHistory).where(
            WorkflowVersionHistory.family_id == family_id,
            WorkflowVersionHistory.company_id == company_id,
            WorkflowVersionHistory.version == version,
        )
    )
    if not hist:
        raise ValueError(f"Version {version} not found")

    current_published = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.family_id == family_id,
            WorkflowDefinition.company_id == company_id,
            WorkflowDefinition.status == "published",
        )
    )
    base = current_published or db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.family_id == family_id,
            WorkflowDefinition.company_id == company_id,
        ).order_by(WorkflowDefinition.version.desc())
    )
    if not base:
        raise ValueError("Workflow family not found")

    return create_new_draft_version_from_snapshot(db, company_id, family_id, hist.snapshot, base)


def create_new_draft_version_from_snapshot(
    db: Session, company_id: UUID, family_id: UUID, snap: dict, ref: WorkflowDefinition
) -> WorkflowDefinition:
    max_ver = db.scalar(
        select(func.max(WorkflowDefinition.version)).where(
            WorkflowDefinition.family_id == family_id,
            WorkflowDefinition.company_id == company_id,
        )
    ) or 0
    draft = WorkflowDefinition(
        company_id=company_id,
        family_id=family_id,
        name=snap.get("name", ref.name),
        version=int(max_ver) + 1,
        status="draft",
        form_schema=copy.deepcopy(snap.get("form_schema") or {}),
        steps=copy.deepcopy(snap.get("steps") or []),
        routing_rules=copy.deepcopy(snap.get("routing_rules") or []),
        settings=copy.deepcopy(snap.get("settings") or {}),
        ai_generated=ref.ai_generated,
        ai_prompt=ref.ai_prompt,
    )
    draft.settings = dict(draft.settings or {})
    draft.settings.pop("published_at", None)
    draft.settings["rolled_back_from_version"] = snap.get("version")
    db.add(draft)
    db.flush()
    return draft


def list_versions(db: Session, family_id: UUID, company_id: UUID) -> list[WorkflowVersionHistory]:
    return list(
        db.scalars(
            select(WorkflowVersionHistory)
            .where(
                WorkflowVersionHistory.family_id == family_id,
                WorkflowVersionHistory.company_id == company_id,
            )
            .order_by(WorkflowVersionHistory.version.desc())
        )
    )


def has_simulation_event(db: Session, workflow_id: UUID, company_id: UUID) -> bool:
    ev = db.scalar(
        select(WorkflowEvent.id).where(
            WorkflowEvent.workflow_definition_id == workflow_id,
            WorkflowEvent.company_id == company_id,
            WorkflowEvent.event_type == "step.started",
        ).limit(1)
    )
    return ev is not None
