"""AI-generated apps from requirements packs (D4) — the signature capability.

Paste/upload a requirements pack (SOPs, forms, notes) and the AI synthesises a whole
working app in one pass: data entities, a request form, approval steps, routing rules,
and a step that writes each submission into the data model — with traceability back to
the source text. The human reviews the plan and creates it; the workflow is then
published through the normal gated flow (never auto-published).

Reuses what already exists rather than inventing: the workflow draft shape + save path
(ai_workflow / ai.save), the typed entity model + field normaliser (business_data), and
the governed strong-tier model (ai_gateway, D1).

ponytail: the generator keeps the process to human approvals + a data-write (richer
service steps are added later in the designer) — safer and simpler than emitting service
configs the model can get wrong. Native per-task forms (BPMN-1) stay a separate follow-up.
"""

from __future__ import annotations

import logging
import uuid
from uuid import UUID

from app.db.models import BusinessEntity, WorkflowDefinition
from app.services import ai_client, ai_gateway, ai_workflow, business_data
from app.services.ai_client import AiError

logger = logging.getLogger(__name__)

_FORM_TYPES = {"text", "textarea", "number", "date", "select", "boolean"}
_ROLES = {"manager", "company_admin", "approver"}


class AppBuilderError(RuntimeError):
    pass


_SYSTEM = """You are WizFlow's application architect. From a business requirements pack,
design ONE working app and output JSON only, with this exact shape:
{
  "name": "<app name>",
  "summary": "<2-3 sentence plain-English description>",
  "entities": [
    {"name": "<Object name, e.g. Customer>",
     "fields": [{"key": "snake_case", "label": "Label", "type": "text|textarea|number|date|boolean|select|relation", "required": true, "options": ["..."], "entity_slug": "<for relation>"}]}
  ],
  "workflow": {
    "name": "<process name>",
    "form_schema": {"fields": [{"key": "snake_case", "label": "Label", "type": "text|textarea|number|date|select|boolean", "required": true, "options": ["..."]}]},
    "steps": [{"id": "step_1", "name": "Manager approval", "type": "approval", "assignee": {"type": "role", "value": "manager|company_admin|approver"}}],
    "routing_rules": [{"when": {"field": "<form field key>", "op": "gt|gte|lt|lte|eq|ne", "value": <number>}, "skip_to": "<step id>"}],
    "settings": {"sla_hours": 48}
  },
  "record_entity": "<slug of the primary entity the submission should be saved into, or null>",
  "traceability": [{"artifact": "<what you created>", "requirement": "<short source excerpt that justified it>"}],
  "warnings": ["<assumptions or missing info>"]
}
Rules: reuse the SAME snake_case keys between the workflow form fields and the primary
entity's fields so submissions map cleanly. Keep steps to human approvals only. Every
routing rule's skip_to must be a real step id. Output JSON only — no prose."""


def _norm_form_fields(fields) -> list[dict]:
    out, seen = [], set()
    for f in fields or []:
        if not isinstance(f, dict):
            continue
        key = business_data.slugify(f.get("key") or f.get("label") or "")
        if not key or key in seen:
            continue
        seen.add(key)
        ftype = f.get("type") if f.get("type") in _FORM_TYPES else "text"
        clean = {"key": key, "type": ftype, "label": f.get("label") or key.replace("_", " ").title(), "required": bool(f.get("required"))}
        if ftype == "select":
            clean["options"] = [str(o) for o in (f.get("options") or [])]
        out.append(clean)
    return out


def _norm_steps(steps) -> tuple[list[dict], list[str]]:
    out, warnings = [], []
    for i, s in enumerate(steps or [], 1):
        if not isinstance(s, dict):
            continue
        if (s.get("type") or "approval") != "approval":
            warnings.append(f"Dropped non-approval step '{s.get('name', s.get('id'))}' — add service steps in the designer.")
            continue
        asg = s.get("assignee") or {}
        val = asg.get("value") if asg.get("value") in _ROLES else "manager"
        out.append({"id": str(s.get("id") or f"step_{i}"), "name": s.get("name") or f"Step {i}", "type": "approval",
                    "assignee": {"type": "role", "value": val}})
    if not out:
        out = [{"id": "step_1", "name": "Manager approval", "type": "approval", "assignee": {"type": "role", "value": "manager"}}]
    return out, warnings


def _norm_entities(entities) -> list[dict]:
    out, seen = [], set()
    for e in entities or []:
        if not isinstance(e, dict):
            continue
        name = (e.get("name") or "").strip()
        if not name:
            continue
        slug = business_data.slugify(name)
        if slug in seen:
            continue
        seen.add(slug)
        out.append({"name": name[:200], "slug": slug, "fields": business_data.normalize_fields(e.get("fields"))})
    return out


def generate_plan(requirements: str, *, company_id: UUID, title: str | None = None) -> dict:
    """Synthesise an app plan from the requirements pack. Raises AppBuilderError."""
    requirements = (requirements or "").strip()
    if len(requirements) < 20:
        raise AppBuilderError("Please provide more detail in the requirements.")
    if not ai_client.is_configured():
        raise AppBuilderError("AI is not configured, so app generation is unavailable.")

    user = (f"App title hint: {title}\n\n" if title else "") + "Requirements pack:\n" + requirements[:12000]
    try:
        raw = ai_gateway.run(
            task=ai_gateway.TASK_REQUIREMENTS_APP, system=_SYSTEM, user=user,
            company_id=company_id, json_mode=True, temperature=0.2, max_tokens=2500,
        )
        data = ai_client.parse_json(raw)
    except AiError as e:
        raise AppBuilderError(f"AI generation failed: {e}")
    except (ValueError, KeyError) as e:
        raise AppBuilderError(f"Could not parse the AI response: {e}")

    entities = _norm_entities(data.get("entities"))
    wf = data.get("workflow") or {}
    steps, step_warnings = _norm_steps(wf.get("steps"))
    form_fields = _norm_form_fields((wf.get("form_schema") or {}).get("fields"))
    routing = ai_workflow._normalize_routing_rules(steps, wf.get("routing_rules"))

    entity_slugs = {e["slug"] for e in entities}
    record_entity = data.get("record_entity")
    record_entity = record_entity if record_entity in entity_slugs else (next(iter(entity_slugs)) if entity_slugs else None)

    warnings = step_warnings + [str(w) for w in (data.get("warnings") or [])]
    traceability = [
        {"artifact": str(t.get("artifact", ""))[:200], "requirement": str(t.get("requirement", ""))[:400]}
        for t in (data.get("traceability") or [])
        if isinstance(t, dict)
    ][:20]

    return {
        "name": str(data.get("name") or title or "Generated App")[:200],
        "summary": str(data.get("summary") or "")[:1000],
        "entities": entities,
        "workflow": {
            "name": str(wf.get("name") or data.get("name") or "Generated Workflow")[:200],
            "form_schema": {"fields": form_fields},
            "steps": steps,
            "routing_rules": routing,
            "settings": wf.get("settings") if isinstance(wf.get("settings"), dict) else {},
        },
        "record_entity": record_entity,
        "traceability": traceability,
        "warnings": warnings,
    }


def create_app(db, plan: dict, *, company_id: UUID, created_by: UUID | None) -> dict:
    """Create the entities + a DRAFT workflow from an (approved) plan. Returns ids.
    The workflow is left as a draft for the human to publish through the normal flow."""
    warnings: list[str] = list(plan.get("warnings") or [])
    created_entities: list[dict] = []

    existing = {e.slug: e for e in db.query(BusinessEntity).filter(BusinessEntity.company_id == company_id).all()}
    for ent in plan.get("entities") or []:
        slug = ent.get("slug") or business_data.slugify(ent.get("name", ""))
        if not slug:
            continue
        if slug in existing:
            warnings.append(f"Entity '{ent.get('name')}' already existed — reused it.")
            created_entities.append({"id": str(existing[slug].id), "slug": slug, "name": existing[slug].name, "reused": True})
            continue
        row = BusinessEntity(
            company_id=company_id, name=(ent.get("name") or slug)[:200], slug=slug,
            fields=business_data.normalize_fields(ent.get("fields")), created_by=created_by,
        )
        db.add(row)
        db.flush()
        existing[slug] = row
        created_entities.append({"id": str(row.id), "slug": slug, "name": row.name, "reused": False})

    wf = plan.get("workflow") or {}
    steps = list(wf.get("steps") or [])
    record_entity = plan.get("record_entity")
    if record_entity and record_entity in existing and not any((s or {}).get("type") == "record" for s in steps):
        steps.append({
            "id": "step_record",
            "name": f"Save to {existing[record_entity].name}",
            "type": "record",
            "entity_slug": record_entity,
        })

    defn = WorkflowDefinition(
        company_id=company_id,
        family_id=uuid.uuid4(),
        name=str(wf.get("name") or plan.get("name") or "Generated Workflow")[:200],
        form_schema=wf.get("form_schema") or {"fields": []},
        steps=steps,
        routing_rules=wf.get("routing_rules") or [],
        settings=wf.get("settings") or {},
        status="draft",
        version=1,
        ai_generated=True,
        ai_prompt=str(plan.get("summary") or "")[:2000],
    )
    db.add(defn)
    db.flush()
    defn.family_id = defn.id
    db.commit()
    db.refresh(defn)

    return {
        "workflow_id": str(defn.id),
        "workflow_name": defn.name,
        "entities": created_entities,
        "record_entity": record_entity,
        "warnings": warnings,
    }


if __name__ == "__main__":  # self-check: plan normalisation (no AI/DB)
    steps, warn = _norm_steps([
        {"id": "step_1", "name": "Mgr", "type": "approval", "assignee": {"type": "role", "value": "manager"}},
        {"id": "x", "name": "Email", "type": "notify"},  # dropped
    ])
    assert [s["id"] for s in steps] == ["step_1"] and warn, (steps, warn)
    assert _norm_steps([])[0][0]["assignee"]["value"] == "manager"  # default step
    ff = _norm_form_fields([{"label": "Total Amount", "type": "number"}, {"key": "k", "type": "bogus"}])
    assert ff[0]["key"] == "total_amount" and ff[1]["type"] == "text", ff
    ents = _norm_entities([{"name": "Customer", "fields": [{"label": "Name", "type": "text"}]}, {"name": ""}])
    assert len(ents) == 1 and ents[0]["slug"] == "customer" and ents[0]["fields"][0]["key"] == "name"
    print("app_builder self-check OK")
