"""Convert a WizFlow diagram (+ bindings) into Spiff-runnable BPMN (Phase B · B1).

A diagram from the designer is valid BPMN but not *executable*: the process is
marked isExecutable="false" and exclusive-gateway branch conditions live in
bindings (bpmn-js drops custom XML), not on the flows. SpiffWorkflow needs
isExecutable="true" and a conditionExpression on each conditioned flow. This
rewrites the XML so the native engine can run it; parallel gateways, user tasks
and events already carry everything they need.

Conditions become Python expressions evaluated by Spiff against the request data
(e.g. amount > 5000, status == 'approved').
"""

from __future__ import annotations

import lxml.etree as ET

BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL"
_PYOP = {"eq": "==", "ne": "!=", "gt": ">", "gte": ">=", "lt": "<", "lte": "<="}


def _expr(cond: dict) -> str:
    field, op, value = cond.get("field"), cond.get("op"), cond.get("value")
    if not field or not op:
        return "True"
    if op in _PYOP:
        return f"{field} {_PYOP[op]} {value!r}"
    if op == "contains":
        return f"{value!r} in str({field})"
    if op == "not_contains":
        return f"{value!r} not in str({field})"
    if op == "in":
        return f"{field} in {value!r}"
    if op == "not_in":
        return f"{field} not in {value!r}"
    if op == "is_empty":
        return f"not {field}"
    if op == "not_empty":
        return f"bool({field})"
    return "True"


def to_executable_bpmn(xml: str, bindings: dict | None = None) -> str:
    """Return BPMN XML that SpiffWorkflow can execute."""
    flows_b: dict = (bindings or {}).get("flows") or {}
    root = ET.fromstring(xml.encode("utf-8"))

    for proc in root.iter(f"{{{BPMN}}}process"):
        proc.set("isExecutable", "true")

    flow_by_id = {f.get("id"): f for f in root.iter(f"{{{BPMN}}}sequenceFlow")}

    for gw in root.iter(f"{{{BPMN}}}exclusiveGateway"):
        out_ids = [o.text for o in gw.findall(f"{{{BPMN}}}outgoing") if o.text]
        # Fallback: derive outgoing from sequenceFlow sourceRef if <outgoing> absent.
        if not out_ids:
            out_ids = [fid for fid, f in flow_by_id.items() if f.get("sourceRef") == gw.get("id")]
        default_flow = None
        for fid in out_ids:
            flow = flow_by_id.get(fid)
            if flow is None:
                continue
            cond = flows_b.get(fid)
            if cond and cond.get("field") and cond.get("op"):
                if flow.find(f"{{{BPMN}}}conditionExpression") is None:
                    ce = ET.SubElement(flow, f"{{{BPMN}}}conditionExpression")
                    ce.text = _expr(cond)
            elif default_flow is None:
                default_flow = fid
        if default_flow:
            gw.set("default", default_flow)

    return ET.tostring(root, pretty_print=True).decode("utf-8")


if __name__ == "__main__":  # self-check: conditions route the native engine correctly
    from app.services import spiff_engine

    XML = """<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="t">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:startEvent id="s"><bpmn:outgoing>f0</bpmn:outgoing></bpmn:startEvent>
    <bpmn:exclusiveGateway id="g"><bpmn:incoming>f0</bpmn:incoming><bpmn:outgoing>fhi</bpmn:outgoing><bpmn:outgoing>flo</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:userTask id="hi" name="Senior Review"><bpmn:incoming>fhi</bpmn:incoming><bpmn:outgoing>f3</bpmn:outgoing></bpmn:userTask>
    <bpmn:userTask id="lo" name="Junior Review"><bpmn:incoming>flo</bpmn:incoming><bpmn:outgoing>f4</bpmn:outgoing></bpmn:userTask>
    <bpmn:endEvent id="e1"><bpmn:incoming>f3</bpmn:incoming></bpmn:endEvent>
    <bpmn:endEvent id="e2"><bpmn:incoming>f4</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="f0" sourceRef="s" targetRef="g"/>
    <bpmn:sequenceFlow id="fhi" sourceRef="g" targetRef="hi"/>
    <bpmn:sequenceFlow id="flo" sourceRef="g" targetRef="lo"/>
    <bpmn:sequenceFlow id="f3" sourceRef="hi" targetRef="e1"/>
    <bpmn:sequenceFlow id="f4" sourceRef="lo" targetRef="e2"/>
  </bpmn:process>
</bpmn:definitions>"""
    bindings = {"flows": {"fhi": {"field": "amount", "op": "gt", "value": 5000}}}
    exe = to_executable_bpmn(XML, bindings)
    assert 'isExecutable="true"' in exe and "amount &gt; 5000" in exe, exe[:400]

    hi = spiff_engine.run_headless(exe, {"amount": 9000})
    assert hi["completed"] and hi["ran"] == ["Senior Review"], hi
    lo = spiff_engine.run_headless(exe, {"amount": 100})
    assert lo["completed"] and lo["ran"] == ["Junior Review"], lo
    print("bpmn_executable self-check OK — gateway conditions drive native execution")
