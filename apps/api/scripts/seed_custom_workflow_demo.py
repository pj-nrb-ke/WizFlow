"""Seed user groups, demo users, form + custom workflows (2-step and 8-step).

Run: python -m scripts.seed_custom_workflow_demo
"""

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.security import hash_password
from app.db.models import (
    Company,
    Role,
    User,
    UserGroup,
    UserGroupMember,
    UserRole,
    WorkflowDefinition,
)
from app.db.session import SessionLocal
from app.services.custom_workflow import build_custom_settings, build_steps_from_chain

COMPANY_SLUG = "demo-co"
PASSWORD = "changeme"

FORM_WORKFLOW_NAME = "Expense claim form (demo)"
CUSTOM_WORKFLOW_NAME = "Expense claim approval (custom)"
MEGA_WORKFLOW_NAME = "Capital expenditure (8-step approval)"

SAMPLE_FORM = {
    "title": "Expense claim",
    "fields": [
        {"key": "amount", "type": "number", "label": "Amount", "required": True},
        {"key": "purpose", "type": "text", "label": "Purpose", "required": True},
        {
            "key": "department",
            "type": "dropdown",
            "label": "Department",
            "required": True,
            "options": [
                {"value": "it", "label": "IT"},
                {"value": "ops", "label": "Operations"},
                {"value": "fin", "label": "Finance"},
            ],
        },
    ],
}

MEGA_FORM = {
    "title": "Capital expenditure request",
    "fields": [
        {"key": "project_name", "type": "text", "label": "Project name", "required": True},
        {"key": "amount", "type": "number", "label": "Total capex (USD)", "required": True},
        {"key": "business_case", "type": "textarea", "label": "Business case", "required": True},
        {"key": "department", "type": "dropdown", "label": "Department", "required": True, "options": [
            {"value": "it", "label": "IT"},
            {"value": "ops", "label": "Operations"},
            {"value": "fin", "label": "Finance"},
        ]},
    ],
}

USERS = (
    ("admin@demo.wizflow.biz", "WizFlow Admin", ("company_admin", "manager")),
    ("originator@demo.wizflow.biz", "Alex Originator", ("originator",)),
    ("originator2@demo.wizflow.biz", "Blake Originator", ("originator",)),
    ("approver1@demo.wizflow.biz", "Sam Approver One", ("approver", "manager")),
    ("approver2@demo.wizflow.biz", "Jordan Approver Two", ("approver",)),
    ("approver3@demo.wizflow.biz", "Riley Approver Three", ("approver",)),
    ("approver4@demo.wizflow.biz", "Morgan Approver Four", ("approver",)),
    ("approver5@demo.wizflow.biz", "Taylor Approver Five", ("approver",)),
    ("approver6@demo.wizflow.biz", "Casey Approver Six", ("approver",)),
    ("approver7@demo.wizflow.biz", "Drew Approver Seven", ("approver",)),
    ("approver8@demo.wizflow.biz", "Jamie Approver Eight", ("approver",)),
    ("ops.user@demo.wizflow.biz", "Casey Operations", ("originator",)),
)

GROUPS = (
    ("Finance approvers", ("approver1@demo.wizflow.biz", "approver2@demo.wizflow.biz")),
    ("Operations starters", ("ops.user@demo.wizflow.biz", "originator@demo.wizflow.biz", "originator2@demo.wizflow.biz")),
    ("Executive committee", ("approver5@demo.wizflow.biz", "approver6@demo.wizflow.biz", "approver7@demo.wizflow.biz")),
)


def _ensure_user(db, company_id, role_map: dict, email: str, name: str, role_slugs: tuple) -> User:
    u = db.scalar(select(User).where(User.email == email))
    if not u:
        u = User(
            company_id=company_id,
            email=email,
            password_hash=hash_password(PASSWORD),
            full_name=name,
            is_active=True,
        )
        db.add(u)
        db.flush()
    for slug in role_slugs:
        role = role_map.get(slug)
        if not role:
            continue
        if not db.scalar(
            select(UserRole).where(UserRole.user_id == u.id, UserRole.role_id == role.id)
        ):
            db.add(UserRole(user_id=u.id, role_id=role.id))
    return u


def _ensure_group(db, company_id, users_by_email: dict, name: str, member_emails: tuple) -> UserGroup:
    g = db.scalar(
        select(UserGroup).where(
            UserGroup.company_id == company_id,
            UserGroup.name == name,
        )
    )
    if not g:
        g = UserGroup(company_id=company_id, name=name)
        db.add(g)
        db.flush()
    for email in member_emails:
        u = users_by_email[email]
        if not db.scalar(
            select(UserGroupMember).where(
                UserGroupMember.group_id == g.id,
                UserGroupMember.user_id == u.id,
            )
        ):
            db.add(UserGroupMember(group_id=g.id, user_id=u.id))
    return g


def _upsert_custom_workflow(
    db,
    company_id,
    *,
    name: str,
    form_schema: dict,
    steps: list,
    settings: dict,
    form_wf_id: str,
) -> WorkflowDefinition:
    custom = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.company_id == company_id,
            WorkflowDefinition.name == name,
        )
    )
    if not custom:
        cid = uuid.uuid4()
        custom = WorkflowDefinition(
            id=cid,
            company_id=company_id,
            family_id=cid,
            name=name,
            form_schema=form_schema,
            steps=steps,
            routing_rules=[],
            settings=settings,
            status="published",
            version=1,
        )
        db.add(custom)
    else:
        custom.form_schema = form_schema
        custom.steps = steps
        custom.settings = {**(custom.settings or {}), **settings}
        custom.status = "published"
    db.flush()
    return custom


def seed_custom_workflow_demo() -> None:
    db = SessionLocal()
    try:
        company = db.scalar(select(Company).where(Company.slug == COMPANY_SLUG))
        if not company:
            print("Run scripts.seed or scripts.seed_prod first (demo-co company missing).")
            return

        roles = db.scalars(select(Role).where(Role.company_id == company.id)).all()
        role_map = {r.slug: r for r in roles}
        for slug in ("company_admin", "manager", "originator", "approver"):
            if slug not in role_map:
                db.add(Role(company_id=company.id, slug=slug, name=slug.replace("_", " ").title()))
        db.flush()
        roles = db.scalars(select(Role).where(Role.company_id == company.id)).all()
        role_map = {r.slug: r for r in roles}

        users_by_email: dict[str, User] = {}
        for email, uname, rslugs in USERS:
            users_by_email[email] = _ensure_user(db, company.id, role_map, email, uname, rslugs)

        groups_by_name: dict[str, UserGroup] = {}
        for gname, emails in GROUPS:
            groups_by_name[gname] = _ensure_group(db, company.id, users_by_email, gname, emails)

        form_wf = db.scalar(
            select(WorkflowDefinition).where(
                WorkflowDefinition.company_id == company.id,
                WorkflowDefinition.name == FORM_WORKFLOW_NAME,
            )
        )
        if not form_wf:
            fid = uuid.uuid4()
            form_wf = WorkflowDefinition(
                id=fid,
                company_id=company.id,
                family_id=fid,
                name=FORM_WORKFLOW_NAME,
                form_schema=SAMPLE_FORM,
                steps=[{"id": "step_1", "name": "Placeholder", "type": "approval", "assignee": {"type": "role", "value": "manager"}}],
                routing_rules=[],
                settings={"serial_prefix": "CWF"},
                status="published",
                version=1,
            )
            db.add(form_wf)
            db.flush()
        else:
            form_wf.form_schema = SAMPLE_FORM
            form_wf.status = "published"

        originator = users_by_email["originator@demo.wizflow.biz"]
        approver1 = users_by_email["approver1@demo.wizflow.biz"]
        finance_group = groups_by_name["Finance approvers"]
        ops_group = groups_by_name["Operations starters"]
        exec_group = groups_by_name["Executive committee"]

        # 2-step custom workflow
        chain_short = [
            {"type": "user", "id": str(approver1.id)},
            {"type": "group", "id": str(finance_group.id)},
        ]
        steps_short = build_steps_from_chain(db, company.id, chain_short)
        settings_short = build_custom_settings(
            attached_form_workflow_id=str(form_wf.id),
            initiator={"everyone": False, "user_ids": [str(originator.id)], "group_ids": [str(ops_group.id)]},
            approver_chain=chain_short,
        )
        settings_short["serial_prefix"] = "ECW"
        _upsert_custom_workflow(
            db, company.id, name=CUSTOM_WORKFLOW_NAME, form_schema=SAMPLE_FORM,
            steps=steps_short, settings=settings_short, form_wf_id=str(form_wf.id),
        )

        # 8-step mega workflow: users and executive group alternating
        mega_chain = [
            {"type": "user", "id": str(users_by_email["approver1@demo.wizflow.biz"].id)},
            {"type": "user", "id": str(users_by_email["approver2@demo.wizflow.biz"].id)},
            {"type": "user", "id": str(users_by_email["approver3@demo.wizflow.biz"].id)},
            {"type": "group", "id": str(finance_group.id)},
            {"type": "user", "id": str(users_by_email["approver4@demo.wizflow.biz"].id)},
            {"type": "user", "id": str(users_by_email["approver5@demo.wizflow.biz"].id)},
            {"type": "group", "id": str(exec_group.id)},
            {"type": "user", "id": str(users_by_email["approver8@demo.wizflow.biz"].id)},
        ]
        steps_mega = build_steps_from_chain(db, company.id, mega_chain)
        assert len(steps_mega) == 8, f"Expected 8 steps, got {len(steps_mega)}"
        settings_mega = build_custom_settings(
            attached_form_workflow_id=str(form_wf.id),
            initiator={
                "everyone": False,
                "user_ids": [
                    str(originator.id),
                    str(users_by_email["originator2@demo.wizflow.biz"].id),
                ],
                "group_ids": [str(ops_group.id)],
            },
            approver_chain=mega_chain,
        )
        settings_mega["serial_prefix"] = "M8C"
        mega = _upsert_custom_workflow(
            db, company.id, name=MEGA_WORKFLOW_NAME, form_schema=MEGA_FORM,
            steps=steps_mega, settings=settings_mega, form_wf_id=str(form_wf.id),
        )

        db.commit()
        print("Custom workflow demo seed complete.")
        print(f"  Form template: {FORM_WORKFLOW_NAME}")
        print(f"  2-step workflow: {CUSTOM_WORKFLOW_NAME} ({len(steps_short)} steps)")
        print(f"  8-step workflow: {MEGA_WORKFLOW_NAME} ({len(steps_mega)} steps)")
        print("  Logins (password changeme): see USERS in seed_custom_workflow_demo.py")
    finally:
        db.close()


if __name__ == "__main__":
    seed_custom_workflow_demo()
