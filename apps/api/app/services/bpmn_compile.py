"""Compile a BPMN 2.0 diagram into a runnable WizFlow workflow (Phase A · A2).

The reverse of bpmn_export: parse the diagram and map its shapes onto the approval
engine's model — one request form + an ordered step list + skip routing — and
report anything the engine cannot run instead of mis-compiling it. This is what
makes "Publish as app" work.

Supported subset (what the linear engine runs):
  * startEvent → entry; endEvent → completion
  * userTask / manualTask / task     → approval step
  * serviceTask / sendTask / scriptTask → service step (notify/webhook/ai/document)
  * exclusiveGateway conditional flows → skip routing rules

WizFlow bindings are read from BPMN extensionElements (namespace below), written by
the properties panel (A1); sensible defaults apply when absent:
  <wizflow:assignee type="role" value="manager" mode="claim"/>   (on a user task)
  <wizflow:service type="notify" message="..." url="..." prompt="..." template_id="..."/>
  <wizflow:form><wizflow:field key= type= label= required=/></wizflow:form>  (on process/start)
  <wizflow:condition field= op= value=/>                          (on a flow out of a gateway)

Unsupported shapes (parallel/inclusive gateways, boundary/intermediate events,
sub-processes, call activities, loops) are returned as errors.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from collections import deque
from dataclasses import dataclass, field

from app.services.workflow_engine import SERVICE_STEP_TYPES

WIZFLOW_NS = "http://wizflow.biz/bpmn"

_APPROVAL_KINDS = {"userTask", "manualTask", "task"}
_SERVICE_KINDS = {"serviceTask", "sendTask", "scriptTask"}
_TASK_KINDS = _APPROVAL_KINDS | _SERVICE_KINDS
_PASSTHROUGH = {"exclusiveGateway"}  # routed but not emitted as steps
_IGNORED = {"textAnnotation", "association", "extensionElements", "incoming", "outgoing"}
# Shapes the linear engine can't run — reject rather than silently drop.
_UNSUPPORTED = {
    "parallelGateway": "parallel gateways (concurrent branches)",
    "inclusiveGateway": "inclusive gateways",
    "complexGateway": "complex gateways",
    "eventBasedGateway": "event-based gateways",
    "boundaryEvent": "boundary events",
    "intermediateCatchEvent": "intermediate catch events",
    "intermediateThrowEvent": "intermediate throw events",
    "subProcess": "sub-processes",
    "transaction": "transaction sub-processes",
    "callActivity": "call activities",
    "businessRuleTask": "business-rule tasks",
}


@dataclass
class CompileResult:
    name: str
    form_schema: dict
    steps: list[dict]
    routing_rules: list[dict]
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def needs_native_execution(xml: str) -> list[str]:
    """Shapes present that the linear engine can't run (→ this diagram needs the
    native SpiffWorkflow engine). Empty = the linear compiler/engine can handle it."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return []
    found: list[str] = []
    for el in root.iter():
        label = _UNSUPPORTED.get(_local(el.tag))
        if label and label not in found:
            found.append(label)
    return found


def _wf(el: ET.Element, name: str) -> ET.Element | None:
    """First wizflow:<name> descendant (direct child or nested in extensionElements)."""
    return next(iter(el.iter(f"{{{WIZFLOW_NS}}}{name}")), None)


def _coerce(value: str | None):
    if value is None:
        return None
    s = value.strip()
    if s.lstrip("-").isdigit():
        return int(s)
    try:
        f = float(s)
        return f
    except ValueError:
        return s


def _find_process(root: ET.Element) -> ET.Element | None:
    if _local(root.tag) == "process":
        return root
    for el in root.iter():
        if _local(el.tag) == "process":
            return el
    return None


def _assignee_for(task: ET.Element, binding: dict | None = None) -> dict:
    if binding:  # from the properties panel — takes precedence
        atype = binding.get("type") or "role"
        if atype == "users":
            return {"type": "users", "user_ids": binding.get("user_ids") or [], "mode": binding.get("mode") or "claim"}
        return {"type": "role", "value": binding.get("value") or "manager", "mode": binding.get("mode") or "claim"}
    node = _wf(task, "assignee")
    if node is None:
        return {"type": "role", "value": "manager"}  # sensible default
    atype = node.get("type") or "role"
    if atype == "users":
        ids = [x for x in (node.get("user_ids") or "").split(",") if x.strip()]
        return {"type": "users", "user_ids": ids, "mode": node.get("mode") or "claim"}
    return {"type": "role", "value": node.get("value") or "manager", "mode": node.get("mode") or "claim"}


def _service_step(task: ET.Element, step_id: str, name: str, binding: dict | None = None) -> tuple[dict, list[str]]:
    src: dict = dict(binding) if binding else {}
    if not src:
        node = _wf(task, "service")
        if node is not None:
            src = {k: node.get(k) for k in ("type", "message", "title", "notify_role", "url", "prompt", "template_id") if node.get(k)}
    stype = src.get("type") or "notify"
    warnings: list[str] = []
    if stype not in SERVICE_STEP_TYPES:
        warnings.append(f"Service task '{name}': unknown type '{stype}', defaulting to notify")
        stype = "notify"
    step = {"id": step_id, "name": name, "type": stype}
    for attr in ("message", "title", "notify_role", "url", "prompt", "template_id"):
        if src.get(attr):
            step[attr] = src[attr]
    return step, warnings


def _form_schema(process: ET.Element, form_binding: list | None = None) -> dict:
    fields: list[dict] = []
    if form_binding:  # from the properties panel
        for f in form_binding:
            key = (f or {}).get("key")
            if not key:
                continue
            fields.append({
                "key": key,
                "type": f.get("type") or "text",
                "label": f.get("label") or key.replace("_", " ").title(),
                "required": bool(f.get("required")),
            })
    else:
        form = _wf(process, "form")  # process-level or on the start event
        if form is not None:
            for f in form.findall(f"{{{WIZFLOW_NS}}}field"):
                key = f.get("key")
                if not key:
                    continue
                fields.append({
                    "key": key,
                    "type": f.get("type") or "text",
                    "label": f.get("label") or key.replace("_", " ").title(),
                    "required": (f.get("required") or "").lower() in ("1", "true", "yes"),
                })
    if not fields:
        # An app needs something to submit; the manager refines this in the form editor.
        fields = [{"key": "title", "type": "text", "label": "Title", "required": True}]
    return {"fields": fields}


def _condition_for(flow: ET.Element, binding: dict | None = None) -> dict | None:
    if binding and binding.get("field") and binding.get("op"):
        return {"field": binding["field"], "op": binding["op"], "value": _coerce_value(binding.get("value"))}
    c = _wf(flow, "condition")
    if c is None or not c.get("field") or not c.get("op"):
        return None
    return {"field": c.get("field"), "op": c.get("op"), "value": _coerce(c.get("value"))}


def _coerce_value(v):
    """Coerce a condition value from the panel (may already be a number)."""
    if isinstance(v, (int, float)) or v is None:
        return v
    return _coerce(str(v))


def _has_cycle(start_ids: list[str], adj: dict[str, list[tuple[str, ET.Element]]]) -> bool:
    WHITE, GREY, BLACK = 0, 1, 2
    color: dict[str, int] = {}

    def visit(n: str) -> bool:
        color[n] = GREY
        for tgt, _ in adj.get(n, []):
            c = color.get(tgt, WHITE)
            if c == GREY:
                return True
            if c == WHITE and visit(tgt):
                return True
        color[n] = BLACK
        return False

    return any(visit(s) for s in start_ids if color.get(s, WHITE) == WHITE)


def _next_task(target: str, nodes: dict, adj: dict) -> str | None:
    """Follow flows from `target` to the first real task node (through gateways)."""
    seen: set[str] = set()
    dq = deque([target])
    while dq:
        n = dq.popleft()
        if n in seen:
            continue
        seen.add(n)
        kind = nodes.get(n, {}).get("kind")
        if kind in _TASK_KINDS:
            return n
        for tgt, _ in adj.get(n, []):
            dq.append(tgt)
    return None


def compile_bpmn_to_workflow(xml: str, *, name: str | None = None, bindings: dict | None = None) -> CompileResult:
    errors: list[str] = []
    warnings: list[str] = []
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as e:
        return CompileResult(name or "Untitled", {"fields": []}, [], [], [f"Invalid BPMN XML: {e}"])

    process = _find_process(root)
    if process is None:
        return CompileResult(name or "Untitled", {"fields": []}, [], [], ["No <process> found in the diagram"])

    wf_name = name or process.get("name") or "Untitled process"
    b = bindings or {}
    tasks_b: dict = b.get("tasks") or {}
    flows_b: dict = b.get("flows") or {}
    form_b: list | None = b.get("form")

    nodes: dict[str, dict] = {}
    flows: list[dict] = []
    for el in process:
        kind = _local(el.tag)
        if kind == "sequenceFlow":
            if el.get("sourceRef") and el.get("targetRef"):
                flows.append({"src": el.get("sourceRef"), "tgt": el.get("targetRef"), "el": el})
            continue
        if kind in _IGNORED:
            continue
        if kind in _UNSUPPORTED:
            label = el.get("name") or el.get("id") or kind
            errors.append(f"Unsupported shape: {_UNSUPPORTED[kind]} ('{label}'). Remove it or use a supported step.")
            continue
        nid = el.get("id")
        if not nid:
            continue
        nodes[nid] = {"kind": kind, "name": el.get("name") or nid, "el": el}

    adj: dict[str, list[tuple[str, ET.Element]]] = {}
    for f in flows:
        if f["src"] in nodes and f["tgt"] in nodes:
            adj.setdefault(f["src"], []).append((f["tgt"], f["el"]))

    starts = [nid for nid, n in nodes.items() if n["kind"] == "startEvent"]
    task_ids_all = [nid for nid, n in nodes.items() if n["kind"] in _TASK_KINDS]
    if not starts:
        errors.append("The diagram needs a start event.")
    if not task_ids_all:
        errors.append("The diagram needs at least one task (user task or service task).")
    if starts and _has_cycle(starts, adj):
        errors.append("Loops are not supported — the flow must move forward to an end.")

    if errors:
        return CompileResult(wf_name, _form_schema(process, form_b), [], [], errors, warnings)

    # ── Order task nodes along the flow (BFS from start) ──
    order: list[str] = []
    seen: set[str] = set()
    dq = deque(starts)
    while dq:
        nid = dq.popleft()
        if nid in seen:
            continue
        seen.add(nid)
        if nodes[nid]["kind"] in _TASK_KINDS:
            order.append(nid)
        for tgt, _ in adj.get(nid, []):
            if tgt not in seen:
                dq.append(tgt)
    # Include any tasks not reached from start (disconnected) so nothing is silently lost.
    for nid in task_ids_all:
        if nid not in order:
            warnings.append(f"Task '{nodes[nid]['name']}' is not connected to the start — appended at the end.")
            order.append(nid)

    # ── Build steps ──
    steps: list[dict] = []
    for nid in order:
        n = nodes[nid]
        tb = tasks_b.get(nid) or {}
        if n["kind"] in _APPROVAL_KINDS:
            steps.append({"id": nid, "name": n["name"], "type": "approval", "assignee": _assignee_for(n["el"], tb.get("assignee"))})
        else:  # service kind
            step, w = _service_step(n["el"], nid, n["name"], tb.get("service"))
            steps.append(step)
            warnings.extend(w)

    # ── Routing from exclusive gateways ──
    routing: list[dict] = []
    for nid, n in nodes.items():
        if n["kind"] != "exclusiveGateway":
            continue
        outs = adj.get(nid, [])
        conditioned = 0
        for tgt, flow_el in outs:
            cond = _condition_for(flow_el, flows_b.get(flow_el.get("id")))
            if not cond:
                continue
            skip_to = _next_task(tgt, nodes, adj)
            if skip_to:
                routing.append({"when": cond, "skip_to": skip_to})
                conditioned += 1
        if len(outs) > 1 and conditioned == 0:
            warnings.append(
                f"Gateway '{n['name']}' has no branch conditions — set them in the properties panel, "
                f"otherwise it always takes the default path."
            )

    # Routing carried in bindings (from a template / the copilot, where the linear
    # diagram can't draw a gateway). skip_to must reference a real step.
    step_ids = {s["id"] for s in steps}
    for rule in (b.get("routing") or []):
        if isinstance(rule, dict) and isinstance(rule.get("when"), dict) and rule.get("skip_to") in step_ids:
            routing.append({"when": rule["when"], "skip_to": rule["skip_to"]})

    return CompileResult(wf_name, _form_schema(process, form_b), steps, routing, errors, warnings)


if __name__ == "__main__":  # self-check: round-trip, routing, unsupported rejection
    from app.services.bpmn_export import workflow_to_bpmn

    # round-trip a linear workflow → BPMN → compile
    xml = workflow_to_bpmn("Purchase Request", [{"name": "Manager Approval"}, {"name": "Finance Approval"}])
    r = compile_bpmn_to_workflow(xml)
    assert r.ok, r.errors
    assert [s["name"] for s in r.steps] == ["Manager Approval", "Finance Approval"], r.steps
    assert all(s["type"] == "approval" and s["assignee"]["value"] == "manager" for s in r.steps)
    assert r.form_schema["fields"], "an app must have at least one form field"

    # unsupported shape → error
    bad = xml.replace("<bpmn:userTask", "<bpmn:parallelGateway", 1).replace("</bpmn:userTask>", "</bpmn:parallelGateway>", 1)
    rb = compile_bpmn_to_workflow(bad)
    assert not rb.ok and any("parallel" in e.lower() for e in rb.errors), rb.errors

    # empty diagram → errors (no task)
    from app.services.bpmn_export import EMPTY_DIAGRAM_XML
    re_ = compile_bpmn_to_workflow(EMPTY_DIAGRAM_XML)
    assert not re_.ok and any("task" in e.lower() for e in re_.errors), re_.errors

    # service task + gateway condition via wizflow extensions
    svc_xml = (
        '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
        'xmlns:wizflow="http://wizflow.biz/bpmn">'
        '<bpmn:process id="P" name="Claims">'
        '<bpmn:startEvent id="S"/><bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="G"/>'
        '<bpmn:exclusiveGateway id="G"/>'
        '<bpmn:sequenceFlow id="f2" sourceRef="G" targetRef="A"><wizflow:condition field="amount" op="gt" value="5000"/></bpmn:sequenceFlow>'
        '<bpmn:sequenceFlow id="f3" sourceRef="G" targetRef="B"/>'
        '<bpmn:userTask id="A" name="Senior Approval"/>'
        '<bpmn:serviceTask id="B" name="Notify Ops"><wizflow:service type="notify" message="Done {title}"/></bpmn:serviceTask>'
        '<bpmn:sequenceFlow id="f4" sourceRef="A" targetRef="B"/>'
        '<bpmn:endEvent id="E"/><bpmn:sequenceFlow id="f5" sourceRef="B" targetRef="E"/>'
        '</bpmn:process></bpmn:definitions>'
    )
    rs = compile_bpmn_to_workflow(svc_xml)
    assert rs.ok, rs.errors
    kinds = {s["id"]: s["type"] for s in rs.steps}
    assert kinds.get("A") == "approval" and kinds.get("B") == "notify", kinds
    assert any(rl["skip_to"] == "A" and rl["when"]["value"] == 5000 for rl in rs.routing_rules), rs.routing_rules

    # bindings overlay (properties panel) takes precedence over XML/defaults
    xml2 = workflow_to_bpmn("Leave", [{"name": "Approval"}])
    task_id = next(s["id"] for s in compile_bpmn_to_workflow(xml2).steps)
    rb2 = compile_bpmn_to_workflow(xml2, bindings={
        "form": [{"key": "days", "type": "number", "label": "Days", "required": True}],
        "tasks": {task_id: {"assignee": {"type": "role", "value": "hr", "mode": "parallel"}}},
    })
    assert rb2.ok, rb2.errors
    assert rb2.steps[0]["assignee"] == {"type": "role", "value": "hr", "mode": "parallel"}, rb2.steps[0]
    assert [f["key"] for f in rb2.form_schema["fields"]] == ["days"], rb2.form_schema
    print("bpmn_compile self-check OK")
