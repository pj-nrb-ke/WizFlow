"""Resolve step assignees: roles, named users, claim / load-balance / round-robin."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AssignmentRoundRobinState, Role, User, UserRole, WorkflowDefinition, WorkflowInstance

ASSIGNMENT_MODES = frozenset({"claim", "load_balance", "round_robin"})


@dataclass
class StepAssignment:
    assignees: list[dict]
    assignment_mode: str | None  # claim | load_balance | round_robin | None when single assignee
    candidate_user_ids: list[str]


def _user_dict(u: User) -> dict:
    return {"user_id": str(u.id), "full_name": u.full_name, "email": u.email}


def _users_by_created_at(db: Session, company_id: UUID, user_ids: list[UUID]) -> list[User]:
    if not user_ids:
        return []
    return list(
        db.scalars(
            select(User)
            .where(
                User.company_id == company_id,
                User.id.in_(user_ids),
                User.is_active.is_(True),
            )
            .order_by(User.created_at.asc(), User.email.asc())
        )
    )


def _users_for_role(db: Session, company_id: UUID, role_slug: str) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .join(UserRole, UserRole.user_id == User.id)
            .join(Role, Role.id == UserRole.role_id)
            .where(
                User.company_id == company_id,
                User.is_active.is_(True),
                Role.company_id == company_id,
                Role.slug == role_slug,
            )
            .order_by(User.created_at.asc(), User.email.asc())
            .distinct()
        )
    )


def _open_inbox_count(db: Session, company_id: UUID, user_id: UUID) -> int:
    uid = str(user_id)
    rows = db.scalars(
        select(WorkflowInstance).where(
            WorkflowInstance.company_id == company_id,
            WorkflowInstance.status == "in_progress",
        )
    )
    count = 0
    for inst in rows:
        if inst.claimed_by_user_id == user_id:
            count += 1
            continue
        if any(a.get("user_id") == uid for a in (inst.assignees or [])):
            if inst.assignment_mode != "claim" or not inst.claimed_by_user_id:
                count += 1
    return count


def _pick_load_balance(db: Session, company_id: UUID, users: list[User]) -> User:
    if len(users) == 1:
        return users[0]
    best = users[0]
    best_count = _open_inbox_count(db, company_id, best.id)
    for u in users[1:]:
        c = _open_inbox_count(db, company_id, u.id)
        if c < best_count:
            best, best_count = u, c
    return best


def _pick_round_robin(
    db: Session,
    *,
    company_id: UUID,
    family_id: UUID,
    step_id: str,
    users: list[User],
) -> User:
    if len(users) == 1:
        return users[0]
    state = db.scalar(
        select(AssignmentRoundRobinState).where(
            AssignmentRoundRobinState.company_id == company_id,
            AssignmentRoundRobinState.family_id == family_id,
            AssignmentRoundRobinState.step_id == step_id,
        )
    )
    if not state:
        state = AssignmentRoundRobinState(
            company_id=company_id,
            family_id=family_id,
            step_id=step_id,
            next_index=0,
        )
        db.add(state)
        db.flush()
    idx = state.next_index % len(users)
    picked = users[idx]
    state.next_index = idx + 1
    return picked


def resolve_step_assignment(
    db: Session,
    *,
    company_id: UUID,
    step: dict,
    family_id: UUID | None = None,
) -> StepAssignment:
    assignee = step.get("assignee") or {}
    atype = assignee.get("type")
    mode = assignee.get("mode") or "claim"
    if mode not in ASSIGNMENT_MODES:
        mode = "claim"

    users: list[User] = []
    if atype == "role":
        value = assignee.get("value")
        if value:
            users = _users_for_role(db, company_id, value)
    elif atype == "users":
        raw_ids = assignee.get("user_ids") or []
        uuids = [UUID(x) if isinstance(x, str) else x for x in raw_ids]
        users = _users_by_created_at(db, company_id, uuids)

    if not users:
        return StepAssignment(assignees=[], assignment_mode=None, candidate_user_ids=[])

    if len(users) == 1:
        u = users[0]
        return StepAssignment(
            assignees=[_user_dict(u)],
            assignment_mode=None,
            candidate_user_ids=[str(u.id)],
        )

    step_id = step.get("id") or ""
    if mode == "load_balance":
        picked = _pick_load_balance(db, company_id, users)
        return StepAssignment(
            assignees=[_user_dict(picked)],
            assignment_mode="load_balance",
            candidate_user_ids=[str(u.id) for u in users],
        )
    if mode == "round_robin" and family_id:
        picked = _pick_round_robin(
            db, company_id=company_id, family_id=family_id, step_id=step_id, users=users
        )
        return StepAssignment(
            assignees=[_user_dict(picked)],
            assignment_mode="round_robin",
            candidate_user_ids=[str(u.id) for u in users],
        )

    return StepAssignment(
        assignees=[_user_dict(u) for u in users],
        assignment_mode="claim",
        candidate_user_ids=[str(u.id) for u in users],
    )


def apply_step_assignment(
    instance: WorkflowInstance,
    assignment: StepAssignment,
) -> None:
    instance.assignees = assignment.assignees
    instance.assignment_mode = assignment.assignment_mode
    instance.claimed_by_user_id = None


def user_in_assignee_pool(instance: WorkflowInstance, user_id: UUID) -> bool:
    uid = str(user_id)
    return any(a.get("user_id") == uid for a in (instance.assignees or []))


def user_can_see_inbox(instance: WorkflowInstance, user_id: UUID) -> bool:
    if instance.status != "in_progress":
        return False
    if instance.assignment_mode == "claim":
        if instance.claimed_by_user_id:
            return instance.claimed_by_user_id == user_id
        return user_in_assignee_pool(instance, user_id)
    return user_in_assignee_pool(instance, user_id)


def user_can_act(instance: WorkflowInstance, user_id: UUID) -> bool:
    if instance.status != "in_progress":
        return False
    if instance.assignment_mode == "claim":
        if instance.claimed_by_user_id:
            return instance.claimed_by_user_id == user_id
        return user_in_assignee_pool(instance, user_id)
    return user_in_assignee_pool(instance, user_id)


def needs_claim(instance: WorkflowInstance, user_id: UUID) -> bool:
    return (
        instance.status == "in_progress"
        and instance.assignment_mode == "claim"
        and instance.claimed_by_user_id is None
        and user_in_assignee_pool(instance, user_id)
    )


def claim_task(db: Session, instance: WorkflowInstance, user_id: UUID) -> None:
    if instance.assignment_mode != "claim":
        raise ValueError("This task does not require claiming")
    if instance.claimed_by_user_id:
        if instance.claimed_by_user_id != user_id:
            raise ValueError("Task already claimed by another user")
        return
    if not user_in_assignee_pool(instance, user_id):
        raise ValueError("You are not in the assignee pool for this task")
    u = db.get(User, user_id)
    if not u:
        raise ValueError("User not found")
    instance.claimed_by_user_id = user_id
    instance.assignees = [_user_dict(u)]
