"""Native BPMN execution via SpiffWorkflow (Phase B · foundation).

The linear engine (the heart of the app) runs simple approval chains; its compiler
rejects shapes it can't model — true parallel/inclusive gateways, boundary &
intermediate events, loops, sub-processes. This module runs *those* diagrams
natively on SpiffWorkflow, a token-based BPMN 2.0 engine, so an "advanced" app can
execute the full diagram while simple apps keep the linear engine unchanged.

Scope of this first increment: parse + execute + serialize a diagram headlessly,
proving native execution of the complex shapes. Wiring Spiff instances into the
live inbox/approval UI, per-task forms, the scheduler (timers/events) and service
tasks is the integration roadmap that follows — deliberately not done here.

ponytail: isolated and opt-in. Nothing imports this into the linear engine; a
diagram runs natively only when needs_native_execution() flags complex shapes.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET

from SpiffWorkflow.bpmn.parser.BpmnParser import BpmnParser
from SpiffWorkflow.bpmn.serializer.workflow import BpmnWorkflowSerializer
from SpiffWorkflow.bpmn.workflow import BpmnWorkflow
from SpiffWorkflow.util.task import TaskState

from app.services.bpmn_compile import _UNSUPPORTED, _local


def needs_native_execution(xml: str) -> list[str]:
    """Shapes present that the linear engine can't run (→ this diagram wants Spiff).

    Empty list = the linear compiler/engine can handle it; keep it there.
    """
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return []
    found: list[str] = []
    for el in root.iter():
        kind = _local(el.tag)
        if kind in _UNSUPPORTED and _UNSUPPORTED[kind] not in found:
            found.append(_UNSUPPORTED[kind])
    return found


def _process_id(parser: BpmnParser) -> str:
    ids = parser.get_process_ids()
    if not ids:
        raise ValueError("No executable <process> found in the diagram")
    return ids[0]


def build(xml: str) -> BpmnWorkflow:
    """Parse BPMN XML into a runnable SpiffWorkflow."""
    parser = BpmnParser()
    parser.add_bpmn_str(xml)
    return BpmnWorkflow(parser.get_spec(_process_id(parser)))


def run_headless(xml: str, data: dict | None = None, *, max_iters: int = 1000) -> dict:
    """Execute a diagram to completion, auto-completing human tasks (for testing /
    proving execution). Returns {completed, ran, data}. Real runs complete human
    tasks from the inbox instead — that bridge is the next increment."""
    wf = build(xml)
    if data:
        wf.data.update(data)
    ran: list[str] = []
    for _ in range(max_iters):
        wf.do_engine_steps()                       # run automatic (engine) tasks
        ready = wf.get_tasks(state=TaskState.READY)  # remaining = human/manual tasks
        if not ready:
            break
        for t in ready:
            ran.append(t.task_spec.bpmn_name or t.task_spec.name)
            t.run()
    wf.do_engine_steps()
    return {"completed": wf.is_completed(), "ran": ran, "data": dict(wf.data)}


def serialize(wf: BpmnWorkflow) -> str:
    """Serialize workflow state to JSON for persistence (future: stored per instance)."""
    return BpmnWorkflowSerializer().serialize_json(wf)


if __name__ == "__main__":  # self-check: run a PARALLEL flow the linear engine can't
    PARALLEL = """<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="t">
  <bpmn:process id="P" isExecutable="true">
    <bpmn:startEvent id="s"><bpmn:outgoing>f0</bpmn:outgoing></bpmn:startEvent>
    <bpmn:parallelGateway id="split"><bpmn:incoming>f0</bpmn:incoming><bpmn:outgoing>f1</bpmn:outgoing><bpmn:outgoing>f2</bpmn:outgoing></bpmn:parallelGateway>
    <bpmn:userTask id="A" name="Legal Review"><bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f3</bpmn:outgoing></bpmn:userTask>
    <bpmn:userTask id="B" name="Finance Review"><bpmn:incoming>f2</bpmn:incoming><bpmn:outgoing>f4</bpmn:outgoing></bpmn:userTask>
    <bpmn:parallelGateway id="join"><bpmn:incoming>f3</bpmn:incoming><bpmn:incoming>f4</bpmn:incoming><bpmn:outgoing>f5</bpmn:outgoing></bpmn:parallelGateway>
    <bpmn:endEvent id="e"><bpmn:incoming>f5</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="f0" sourceRef="s" targetRef="split"/>
    <bpmn:sequenceFlow id="f1" sourceRef="split" targetRef="A"/>
    <bpmn:sequenceFlow id="f2" sourceRef="split" targetRef="B"/>
    <bpmn:sequenceFlow id="f3" sourceRef="A" targetRef="join"/>
    <bpmn:sequenceFlow id="f4" sourceRef="B" targetRef="join"/>
    <bpmn:sequenceFlow id="f5" sourceRef="join" targetRef="e"/>
  </bpmn:process>
</bpmn:definitions>"""
    assert needs_native_execution(PARALLEL), "parallel gateway should require native execution"
    result = run_headless(PARALLEL)
    assert result["completed"], result
    assert set(result["ran"]) == {"Legal Review", "Finance Review"}, result["ran"]  # BOTH branches ran
    # serialization produces persistable JSON (for future per-instance storage)
    snap = serialize(build(PARALLEL))
    assert isinstance(snap, str) and len(snap) > 100, "expected serialized workflow JSON"
    # a purely linear diagram does NOT need native execution
    from app.services.bpmn_export import workflow_to_bpmn
    assert needs_native_execution(workflow_to_bpmn("x", [{"name": "Only Step"}])) == []
    print("spiff_engine self-check OK — native parallel execution works")
