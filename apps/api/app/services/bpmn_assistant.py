"""Conversational step-builder for the Process Designer (Phase A · A4).

The manager talks; the canvas changes. Rather than a fragile diagram-mutation DSL,
this reuses the existing NL workflow engine (ai_workflow draft/refine, which already
runs on the multi-provider AI client and falls back to templates without a key):

  current diagram + bindings → compile back to a workflow → refine with the message
  → render the new workflow as BPMN (bpmn_export) + bindings → return to the canvas.

So "start with a purchase request, add finance approval over 10k, collect an amount
field" becomes an updated diagram + request form, reversibly, one message at a time.

ponytail: v1 drives the linear step spine + form + per-step assignee (what the
exporter can draw). AI-authored branching is surfaced as a note rather than drawn —
the manager adds a gateway and sets its condition in the properties panel (A1).
"""

from __future__ import annotations

from app.services import ai_workflow
from app.services.bpmn_compile import compile_bpmn_to_workflow
from app.services.bpmn_export import workflow_to_bpmn
from app.services.workflow_engine import SERVICE_STEP_TYPES

_SERVICE_ATTRS = ("message", "title", "notify_role", "url", "prompt", "template_id")


def _draft_to_bindings(draft: dict) -> dict:
    """Map an ai_workflow draft onto bindings keyed by the ids the exporter emits
    (Activity_1..N, one per step, in order)."""
    fields = (draft.get("form_schema") or {}).get("fields") or []
    tasks: dict[str, dict] = {}
    for i, s in enumerate(draft.get("steps") or []):
        if not isinstance(s, dict):
            continue
        key = f"Activity_{i + 1}"
        stype = s.get("type") or "approval"
        if stype in SERVICE_STEP_TYPES:
            svc = {"type": stype}
            for a in _SERVICE_ATTRS:
                if s.get(a):
                    svc[a] = s[a]
            tasks[key] = {"service": svc}
        else:
            tasks[key] = {"assignee": s.get("assignee") or {"type": "role", "value": "manager"}}
    return {"form": fields, "tasks": tasks}


def draft_to_diagram(draft: dict) -> dict:
    """Render an ai_workflow/template draft as a diagram: {name, bpmn_xml, bindings}.

    The exporter draws a linear spine, so routing_rules are carried in bindings.routing
    (remapped onto the exporter's Activity ids) and applied by the compiler.
    """
    name = draft.get("name") or "Untitled process"
    steps = draft.get("steps") or []
    bindings = _draft_to_bindings(draft)
    idmap = {s["id"]: f"Activity_{i + 1}" for i, s in enumerate(steps) if isinstance(s, dict) and s.get("id")}
    routing = [
        {"when": r["when"], "skip_to": idmap[r["skip_to"]]}
        for r in (draft.get("routing_rules") or [])
        if isinstance(r, dict) and isinstance(r.get("when"), dict) and r.get("skip_to") in idmap
    ]
    if routing:
        bindings["routing"] = routing
    return {"name": name, "bpmn_xml": workflow_to_bpmn(name, steps), "bindings": bindings}


def assist(*, xml: str, bindings: dict | None, message: str) -> dict:
    message = (message or "").strip()
    if not message:
        raise ValueError("Say what you'd like the app to do.")

    current = compile_bpmn_to_workflow(xml, bindings=bindings)
    if current.ok and current.steps:
        current_draft = {
            "name": current.name,
            "form_schema": current.form_schema,
            "steps": current.steps,
            "routing_rules": current.routing_rules,
        }
        result = ai_workflow.refine_draft(current_draft, message)
    else:
        result = ai_workflow.draft_from_description(message)

    draft = result.get("draft") or {}
    if not draft.get("name"):
        draft["name"] = current.name
    diagram = draft_to_diagram(draft)

    warnings = list(result.get("gaps") or [])
    if draft.get("routing_rules"):
        warnings.append("Branching is applied; add a gateway on the canvas to show it visually.")
    return {
        "reply": result.get("explanation") or "Updated the app.",
        "name": diagram["name"],
        "bpmn_xml": diagram["bpmn_xml"],
        "bindings": diagram["bindings"],
        "warnings": warnings,
        "source": result.get("source") or "template",
    }


if __name__ == "__main__":  # self-check: empty→draft, then refine; bindings keyed to exporter ids
    from app.services.bpmn_export import EMPTY_DIAGRAM_XML

    r1 = assist(xml=EMPTY_DIAGRAM_XML, bindings=None, message="Leave approval for staff with a manager sign-off")
    assert r1["bpmn_xml"].startswith("<?xml") and "userTask" in r1["bpmn_xml"], r1["bpmn_xml"][:80]
    assert r1["bindings"]["tasks"], r1["bindings"]
    # refine the produced diagram
    r2 = assist(xml=r1["bpmn_xml"], bindings=r1["bindings"], message="add a finance approval step")
    # the refined draft re-compiles cleanly
    from app.services.bpmn_compile import compile_bpmn_to_workflow as _c
    cr = _c(r2["bpmn_xml"], bindings=r2["bindings"])
    assert cr.ok, cr.errors
    assert all(k.startswith("Activity_") for k in r2["bindings"]["tasks"]), r2["bindings"]["tasks"]

    # draft_to_diagram carries routing (remapped to exporter ids) → compiler applies it
    d = draft_to_diagram({
        "name": "P",
        "steps": [{"id": "a", "name": "Mgr"}, {"id": "b", "name": "Fin"}],
        "routing_rules": [{"when": {"field": "amount", "op": "gt", "value": 100}, "skip_to": "b"}],
    })
    cr2 = compile_bpmn_to_workflow(d["bpmn_xml"], bindings=d["bindings"])
    assert cr2.ok and any(r["skip_to"] == "Activity_2" and r["when"]["value"] == 100 for r in cr2.routing_rules), \
        (d["bindings"], cr2.routing_rules)
    print("bpmn_assistant self-check OK")
