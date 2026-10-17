"""Suite service: group published processes into no-code "applications".

A Suite bundles and orders several workflow *families* (the logical workflow,
stable across versions) and exposes them to end users as one launcher. Suites do
not orchestrate — each member process keeps its own form, approvals and versioning.
The current *published* version of each member is resolved at read time.
"""

from __future__ import annotations

import re
import uuid as _uuid
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.data.workflow_templates import get_template
from app.db.models import Suite, SuiteItem, WorkflowDefinition
from app.services.custom_workflow import workflow_name_taken
from app.services.initiators import user_can_initiate


# ── Slugs ────────────────────────────────────────────────────────────────────
def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").strip().lower()).strip("-")
    return s or "suite"


def _unique_slug(db: Session, company_id: UUID, base: str) -> str:
    base = slugify(base)[:110]
    existing = set(
        db.scalars(select(Suite.slug).where(Suite.company_id == company_id))
    )
    if base not in existing:
        return base
    for n in range(2, 1000):
        cand = f"{base}-{n}"
        if cand not in existing:
            return cand
    return f"{base}-{_uuid.uuid4().hex[:6]}"


# ── Workflow family resolution ───────────────────────────────────────────────
def _rep_better(d_pub: bool, d_ver: int, cur_pub: bool, cur_ver: int) -> bool:
    """Should definition (d_pub, d_ver) replace the current representative?

    Prefer a published version; among equal publish-state prefer the higher version.
    This makes the launcher pick the live published version even when a newer draft
    of the same family exists.
    """
    if d_pub != cur_pub:
        return d_pub
    return d_ver >= cur_ver


def family_reps(db: Session, company_id: UUID) -> dict[UUID, WorkflowDefinition]:
    """One representative WorkflowDefinition per family for a company (published
    preferred, else newest). ponytail: reduced in Python — fine for the per-company
    workflow counts here; add a windowed SQL query if a tenant's workflow list grows huge."""
    reps: dict[UUID, WorkflowDefinition] = {}
    for d in db.scalars(
        select(WorkflowDefinition).where(WorkflowDefinition.company_id == company_id)
    ):
        cur = reps.get(d.family_id)
        if cur is None or _rep_better(
            d.status == "published", d.version, cur.status == "published", cur.version
        ):
            reps[d.family_id] = d
    return reps


def _process_dict(
    family_id: UUID,
    defn: WorkflowDefinition | None,
    position: int,
    *,
    can_initiate: bool = True,
) -> dict:
    published = bool(defn and defn.status == "published")
    return {
        "family_id": family_id,
        "workflow_id": defn.id if published else None,
        "name": defn.name if defn else "(removed process)",
        "status": (defn.status if defn else "unavailable") if defn else "unavailable",
        "description": (defn.settings or {}).get("description") if defn else None,
        "category": (defn.settings or {}).get("category") if defn else None,
        "position": position,
        "can_initiate": can_initiate,
    }


# ── CRUD ─────────────────────────────────────────────────────────────────────
def list_suites(db: Session, company_id: UUID) -> list[Suite]:
    return list(
        db.scalars(
            select(Suite)
            .where(Suite.company_id == company_id)
            .order_by(Suite.position.asc(), Suite.name.asc())
        )
    )


def get_suite(db: Session, company_id: UUID, suite_id: UUID) -> Suite | None:
    s = db.get(Suite, suite_id)
    if not s or s.company_id != company_id:
        return None
    return s


def _valid_families(db: Session, company_id: UUID, family_ids: list[UUID]) -> list[UUID]:
    """Keep only families that exist in this company, de-duplicated, order preserved."""
    valid = set(
        db.scalars(
            select(WorkflowDefinition.family_id).where(
                WorkflowDefinition.company_id == company_id
            )
        )
    )
    out: list[UUID] = []
    seen: set[UUID] = set()
    for fid in family_ids:
        if fid in valid and fid not in seen:
            out.append(fid)
            seen.add(fid)
    return out


def _replace_items(db: Session, suite: Suite, family_ids: list[UUID]) -> None:
    db.query(SuiteItem).filter(SuiteItem.suite_id == suite.id).delete(synchronize_session=False)
    for pos, fid in enumerate(family_ids):
        db.add(
            SuiteItem(
                company_id=suite.company_id,
                suite_id=suite.id,
                family_id=fid,
                position=pos,
            )
        )


def create_suite(
    db: Session,
    company_id: UUID,
    *,
    name: str,
    description: str | None = None,
    icon: str | None = None,
    accent: str | None = None,
    status: str = "draft",
    family_ids: list[UUID] | None = None,
) -> Suite:
    max_pos = db.scalar(
        select(func.max(Suite.position)).where(Suite.company_id == company_id)
    )
    suite = Suite(
        company_id=company_id,
        name=name.strip(),
        slug=_unique_slug(db, company_id, name),
        description=description,
        icon=icon,
        accent=accent,
        status=status if status in ("draft", "published") else "draft",
        position=(max_pos + 1) if max_pos is not None else 0,
    )
    db.add(suite)
    db.flush()
    if family_ids:
        _replace_items(db, suite, _valid_families(db, company_id, family_ids))
    db.commit()
    db.refresh(suite)
    return suite


def update_suite(db: Session, suite: Suite, **fields) -> Suite:
    for key in ("name", "description", "icon", "accent", "status"):
        if key in fields and fields[key] is not None:
            setattr(suite, key, fields[key].strip() if key == "name" else fields[key])
    db.commit()
    db.refresh(suite)
    return suite


def set_items(db: Session, suite: Suite, family_ids: list[UUID]) -> Suite:
    _replace_items(db, suite, _valid_families(db, suite.company_id, family_ids))
    db.commit()
    db.refresh(suite)
    return suite


def delete_suite(db: Session, suite: Suite) -> None:
    db.delete(suite)
    db.commit()


def reorder_suites(db: Session, company_id: UUID, ordered_ids: list[UUID]) -> None:
    by_id = {s.id: s for s in list_suites(db, company_id)}
    for pos, sid in enumerate(ordered_ids):
        if sid in by_id:
            by_id[sid].position = pos
    db.commit()


# ── Views ────────────────────────────────────────────────────────────────────
def suite_detail(
    db: Session, suite: Suite, reps: dict[UUID, WorkflowDefinition] | None = None
) -> dict:
    reps = reps if reps is not None else family_reps(db, suite.company_id)
    items = [
        _process_dict(it.family_id, reps.get(it.family_id), it.position)
        for it in suite.items
    ]
    return {
        "id": suite.id,
        "name": suite.name,
        "slug": suite.slug,
        "description": suite.description,
        "icon": suite.icon,
        "accent": suite.accent,
        "status": suite.status,
        "position": suite.position,
        "item_count": len(items),
        "items": items,
        "created_at": suite.created_at,
        "updated_at": suite.updated_at,
    }


def available_processes(db: Session, company_id: UUID) -> list[dict]:
    """All workflow families (published + draft) for the suite builder's picker."""
    reps = family_reps(db, company_id)
    out = [_process_dict(fid, defn, 0) for fid, defn in reps.items()]
    out.sort(key=lambda p: (p["status"] != "published", p["name"].lower()))
    return out


def launcher_for_user(db: Session, company_id: UUID, user_id: UUID) -> dict:
    """End-user view: published suites (with launchable, initiable processes) plus an
    ``ungrouped`` bucket of published/initiable workflows not in any published suite."""
    reps = family_reps(db, company_id)

    def initiable(defn: WorkflowDefinition | None) -> bool:
        return bool(defn and defn.status == "published" and user_can_initiate(db, user_id, defn))

    suites_out: list[dict] = []
    grouped_in_published: set[UUID] = set()
    for suite in list_suites(db, company_id):
        if suite.status != "published":
            continue
        procs: list[dict] = []
        for it in suite.items:
            grouped_in_published.add(it.family_id)
            defn = reps.get(it.family_id)
            if initiable(defn):
                procs.append(_process_dict(it.family_id, defn, it.position, can_initiate=True))
        if procs:  # don't show an empty suite card
            suites_out.append(
                {
                    "id": suite.id,
                    "name": suite.name,
                    "slug": suite.slug,
                    "description": suite.description,
                    "icon": suite.icon,
                    "accent": suite.accent,
                    "processes": procs,
                }
            )

    ungrouped = [
        _process_dict(fid, defn, 0, can_initiate=True)
        for fid, defn in reps.items()
        if fid not in grouped_in_published and initiable(defn)
    ]
    ungrouped.sort(key=lambda p: p["name"].lower())
    return {"suites": suites_out, "ungrouped": ungrouped}


# ── Starter templates (ready-made applications) ──────────────────────────────
SUITE_TEMPLATES: list[dict] = [
    {
        "id": "expense_management",
        "name": "Expense Management",
        "description": "Everything employees claim: petty cash, imprest, transport and travel — each with its own approval flow.",
        "icon": "💳",
        "template_ids": ["petty_cash", "imprest_claim", "transport_claim", "travel_expense"],
    },
    {
        "id": "procurement",
        "name": "Procurement",
        "description": "Source, buy and onboard: purchase requests, vendor onboarding and contract approvals.",
        "icon": "📦",
        "template_ids": ["purchase_request", "vendor_onboarding", "contract_approval"],
    },
    {
        "id": "hr_people",
        "name": "HR & People",
        "description": "Everyday people requests: leave and overtime, routed to the right manager.",
        "icon": "🧑‍💼",
        "template_ids": ["leave_request", "overtime_request"],
    },
    {
        "id": "it_facilities",
        "name": "IT & Facilities",
        "description": "Keep the office running: system access and equipment requests.",
        "icon": "🛠️",
        "template_ids": ["it_access", "equipment_request"],
    },
]


def get_suite_template(template_id: str) -> dict | None:
    for t in SUITE_TEMPLATES:
        if t["id"] == template_id:
            return t
    return None


def list_suite_templates() -> list[dict]:
    out: list[dict] = []
    for t in SUITE_TEMPLATES:
        names = [get_template(tid)["name"] for tid in t["template_ids"] if get_template(tid)]
        out.append(
            {
                "id": t["id"],
                "name": t["name"],
                "description": t["description"],
                "icon": t["icon"],
                "process_names": names,
                "process_count": len(names),
            }
        )
    return out


def _clone_workflow_template(db: Session, company_id: UUID, tpl: dict) -> UUID:
    """Clone one workflow template into a new draft; returns its family_id.
    Carries the template category into settings so suites/filters have it (fixes the
    category-dropped-on-clone gap)."""
    name = tpl["name"]
    if workflow_name_taken(db, company_id, name):
        name = f"{name} (from template)"
    settings = dict(tpl.get("settings") or {})
    if tpl.get("category"):
        settings.setdefault("category", tpl["category"])
    if tpl.get("description"):
        settings.setdefault("description", tpl["description"])
    defn = WorkflowDefinition(
        company_id=company_id,
        family_id=_uuid.uuid4(),
        name=name,
        form_schema=tpl.get("form_schema") or {},
        steps=tpl.get("steps") or [],
        routing_rules=tpl.get("routing_rules") or [],
        settings=settings,
        status="draft",
        version=1,
    )
    db.add(defn)
    db.flush()
    defn.family_id = defn.id
    return defn.family_id


def clone_suite_template(db: Session, company_id: UUID, template_id: str) -> dict:
    """Clone a starter suite: create a draft workflow for each member template, then a
    draft Suite grouping them. The admin then reviews/publishes each process and the suite."""
    tpl = get_suite_template(template_id)
    if not tpl:
        raise ValueError("Suite template not found")

    family_ids: list[UUID] = []
    for tid in tpl["template_ids"]:
        wtpl = get_template(tid)
        if wtpl:
            family_ids.append(_clone_workflow_template(db, company_id, wtpl))
    db.flush()

    suite = create_suite(
        db,
        company_id,
        name=tpl["name"],
        description=tpl["description"],
        icon=tpl["icon"],
        status="draft",
        family_ids=family_ids,
    )
    return {"suite_id": suite.id, "name": suite.name, "created_workflows": len(family_ids)}


if __name__ == "__main__":  # self-check: pure logic (no DB)
    assert slugify("Expense Management!") == "expense-management"
    assert slugify("  ") == "suite"
    # published beats draft regardless of version; else higher version wins
    assert _rep_better(True, 1, False, 9) is True      # published replaces newer draft
    assert _rep_better(False, 9, True, 1) is False     # draft never replaces published
    assert _rep_better(True, 3, True, 2) is True       # newer published wins
    assert _rep_better(False, 2, False, 3) is False    # older draft loses
    assert all(get_template(tid) for t in SUITE_TEMPLATES for tid in t["template_ids"]), \
        "every suite-template member must reference a real workflow template"
    print("suites service self-check OK")
