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

from SpiffWorkflow.util.task import TaskState

from app.services import spiff_engine
from app.services.bpmn_executable import to_executable_bpmn


def _ready(wf) -> list[dict]:
    return [
        {"id": str(t.id), "name": t.task_spec.bpmn_name or t.task_spec.name, "bpmn_id": t.task_spec.bpmn_id}
        for t in wf.get_tasks(state=TaskState.READY)
    ]


def _snapshot(wf) -> dict:
    """Serialized state + status + the human tasks now awaiting action."""
    return {
        "state": spiff_engine.serialize(wf),
        "status": "completed" if wf.is_completed() else "running",
        "ready_tasks": _ready(wf),
    }


def user_eligible(assignee: dict | None, roles, user_id) -> bool:
    """Whether a user may act on a task with this binding assignee (default: manager role)."""
    a = assignee or {"type": "role", "value": "manager"}
    if a.get("type") == "users":
        return str(user_id) in [str(x) for x in (a.get("user_ids") or [])]
    return (a.get("value") or "manager") in set(roles or [])


def _drive(wf, service_runner=None, max_iters: int = 1000) -> None:
    """Run engine steps, executing any STARTED service task via service_runner then
    completing it, until only human tasks (or nothing) remain. Service tasks that
    have no runner/config complete as no-ops so the flow never hangs."""
    for _ in range(max_iters):
        wf.do_engine_steps()
        started = wf.get_tasks(state=TaskState.STARTED)
        if not started:
            break
        for t in started:
            result = service_runner(t.task_spec.bpmn_id, dict(t.data)) if service_runner else None
            if result:
                t.set_data(**result)
            t.complete()
    wf.do_engine_steps()


def start(xml: str, bindings: dict | None, data: dict | None = None, *, service_runner=None) -> dict:
    """Begin a native run from a diagram + bindings and the submitter's form data."""
    wf = spiff_engine.build(to_executable_bpmn(xml, bindings))
    if data:
        wf.get_tasks()[0].data.update(data)  # seed on root → propagates to conditions
    _drive(wf, service_runner)
    return _snapshot(wf)


def advance_timers(state: str, *, service_runner=None) -> dict:
    """Refresh time/wait tasks (timers, boundary events) and drive — called by the scheduler."""
    wf = spiff_engine.deserialize(state)
    wf.refresh_waiting_tasks()
    _drive(wf, service_runner)
    return _snapshot(wf)


def ready_tasks(state: str) -> list[dict]:
    """Human tasks currently awaiting action (read-only), from serialized state."""
    return _ready(spiff_engine.deserialize(state))


def complete_task(state: str, task_id: str, data: dict | None = None, *, authorize=None, service_runner=None) -> dict:
    """Complete a human task (with its form data) and advance the resumed state.

    `authorize(bpmn_id) -> bool`, when given, gates who may complete the task.
    """
    wf = spiff_engine.deserialize(state)
    task = wf.get_task_from_id(UUID(str(task_id)))
    if task is None:
        raise ValueError(f"Task {task_id} not found or no longer active")
    if authorize is not None and not authorize(task.task_spec.bpmn_id):
        raise PermissionError("You are not assigned to this task")
    if data:
        task.set_data(**data)
    task.run()
    _drive(wf, service_runner)
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

    # service task: engine starts it, our runner executes it, flow advances to the human task
    SVC = """<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="t">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:startEvent id="s"><bpmn:outgoing>f0</bpmn:outgoing></bpmn:startEvent>
    <bpmn:serviceTask id="svc" name="Notify Ops"><bpmn:incoming>f0</bpmn:incoming><bpmn:outgoing>f1</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:userTask id="u" name="Review"><bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing></bpmn:userTask>
    <bpmn:endEvent id="e"><bpmn:incoming>f2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="f0" sourceRef="s" targetRef="svc"/>
    <bpmn:sequenceFlow id="f1" sourceRef="svc" targetRef="u"/>
    <bpmn:sequenceFlow id="f2" sourceRef="u" targetRef="e"/>
  </bpmn:process>
</bpmn:definitions>"""
    # no runner → service task completes as a no-op, flow reaches the human task
    s = start(SVC, None, {})
    assert s["status"] == "running" and [t["name"] for t in s["ready_tasks"]] == ["Review"], s
    # with a runner → it is invoked for the service task's bpmn id
    seen = {}
    def _runner(bpmn_id, task_data):
        seen["id"] = bpmn_id
        return {"svc_done": True}
    s_r = start(SVC, None, {}, service_runner=_runner)
    assert seen.get("id") == "svc" and [t["name"] for t in s_r["ready_tasks"]] == ["Review"], (seen, s_r)
    print("native_instance self-check OK — persistence, advance, and service tasks")
