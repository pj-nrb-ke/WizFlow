"""Native BPMN instance lifecycle (Phase B · B2).

Runs a designer diagram on SpiffWorkflow and persists its state as JSON between
calls, so a native app can start, wait on human tasks, and advance over time —
the engine equivalent of the linear instance_engine, but for the complex diagrams
the linear engine can't model. Persistence-agnostic: these functions take and
return a serialized state string that the DB layer stores (see the BpmnInstance
model / router that wrap this next).

State round-trips through serialize_json / deserialize_json each step, so a human
task completed in one request resumes the exact token state from the last.
"""

from __future__ import annotations

from uuid import UUID

from SpiffWorkflow.bpmn.serializer.workflow import BpmnWorkflowSerializer
from SpiffWorkflow.util.task import TaskState

from app.services import spiff_engine
from app.services.bpmn_executable import to_executable_bpmn

_serializer = BpmnWorkflowSerializer()


def _snapshot(wf) -> dict:
    """Serialized state + status + the human tasks now awaiting action."""
    ready = [
        {"id": str(t.id), "name": t.task_spec.bpmn_name or t.task_spec.name}
        for t in wf.get_tasks(state=TaskState.READY)
    ]
    return {
        "state": _serializer.serialize_json(wf),
        "status": "completed" if wf.is_completed() else "running",
        "ready_tasks": ready,
    }


def start(xml: str, bindings: dict | None, data: dict | None = None) -> dict:
    """Begin a native run from a diagram + bindings and the submitter's form data."""
    wf = spiff_engine.build(to_executable_bpmn(xml, bindings))
    if data:
        wf.get_tasks()[0].data.update(data)  # seed on root → propagates to conditions
    wf.do_engine_steps()
    return _snapshot(wf)


def ready_tasks(state: str) -> list[dict]:
    """Human tasks currently awaiting action (read-only), from serialized state."""
    wf = _serializer.deserialize_json(state)
    return [
        {"id": str(t.id), "name": t.task_spec.bpmn_name or t.task_spec.name}
        for t in wf.get_tasks(state=TaskState.READY)
    ]


def complete_task(state: str, task_id: str, data: dict | None = None) -> dict:
    """Complete a human task (with its form data) and advance the resumed state."""
    wf = _serializer.deserialize_json(state)
    task = wf.get_task_from_id(UUID(str(task_id)))
    if task is None:
        raise ValueError(f"Task {task_id} not found or no longer active")
    if data:
        task.set_data(**data)
    task.run()
    wf.do_engine_steps()
    return _snapshot(wf)


if __name__ == "__main__":  # self-check: start → persist → resume → advance → complete
    PARALLEL = """<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="t">
  <bpmn:process id="P" isExecutable="false">
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
    snap = start(PARALLEL, None, {"amount": 1})
    assert snap["status"] == "running" and len(snap["ready_tasks"]) == 2, snap
    # resume from the serialized state (simulating a later request) and complete one
    snap2 = complete_task(snap["state"], snap["ready_tasks"][0]["id"])
    assert snap2["status"] == "running" and len(snap2["ready_tasks"]) == 1, snap2
    # complete the second → the join fires and the flow completes
    snap3 = complete_task(snap2["state"], snap2["ready_tasks"][0]["id"])
    assert snap3["status"] == "completed", snap3
    print("native_instance self-check OK — state persists & advances across calls")
