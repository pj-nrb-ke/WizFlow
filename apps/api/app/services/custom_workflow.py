"""Build custom approval workflows from ordered approver chains."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import UserGroup, WorkflowDefinition
from app.services.user_groups import expand_user_ids


class CustomWorkflowError(ValueError):
    pass


def workflow_name_taken(
    db: Session,
    company_id: UUID,
    name: str,
    *,
    exclude_id: UUID | None = None,
) -> bool:
    normalized = name.strip().lower()
    if not normalized:
        return False
    q = select(WorkflowDefinition.id).where(
        WorkflowDefinition.company_id == company_id,
        func.lower(WorkflowDefinition.name) == normalized,
    )
    if exclude_id:
        q = q.where(WorkflowDefinition.id != exclude_id)
    return db.scalar(q) is not None


def _expand_chain_item(db: Session, company_id: UUID, item: dict) -> list[UUID]:
    kind = item.get("type")
    raw_id = item.get("id")
    if not kind or not raw_id:
        return []
    uid = UUID(raw_id) if isinstance(raw_id, str) else raw_id
    if kind == "user":
        return expand_user_ids(db, company_id, user_ids=[uid])
    if kind == "group":
        grp = db.get(UserGroup, uid)
        if not grp or grp.company_id != company_id:
            return []
        return expand_user_ids(db, company_id, group_ids=[uid])
    return []


def build_steps_from_chain(db: Session, company_id: UUID, chain: list[dict]) -> list[dict]:
    if not chain:
        raise CustomWorkflowError("Add at least one approver (user or group)")
    steps: list[dict] = []
    for i, item in enumerate(chain):
        user_ids = _expand_chain_item(db, company_id, item)
        if not user_ids:
            label = item.get("type", "item")
            raise CustomWorkflowError(f"Approver {i + 1} ({label}) has no active users")
        steps.append(
            {
                "id": f"step_{i + 1}",
                "name": _step_label(db, company_id, item, i + 1),
                "type": "approval",
                "assignee": {
                    "type": "users",
                    "user_ids": [str(u) for u in user_ids],
                    "mode": "claim",
                },
            }
        )
    return steps


def _step_label(db: Session, company_id: UUID, item: dict, index: int) -> str:
    kind = item.get("type")
    raw_id = item.get("id")
    if kind == "user" and raw_id:
        from app.db.models import User

        u = db.get(User, UUID(str(raw_id)))
        if u:
            return f"Approval: {u.full_name}"
    if kind == "group" and raw_id:
        g = db.get(UserGroup, UUID(str(raw_id)))
        if g and g.company_id == company_id:
            return f"Approval: {g.name}"
    return f"Approval step {index}"


def build_custom_settings(
    *,
    attached_form_workflow_id: str,
    initiator: dict,
    approver_chain: list[dict],
) -> dict:
    return {
        "custom_workflow": {
            "attached_form_workflow_id": attached_form_workflow_id,
            "initiator": initiator,
            "approver_chain": approver_chain,
            "show_approval_buttons": True,
        }
    }
