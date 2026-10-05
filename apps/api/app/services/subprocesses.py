"""Reusable sub-processes by design-time insert (copy semantics).

Clone a saved workflow's steps (and their internal routing) into a draft, with
namespaced ids so the manager can then tweak them. This gives real reuse —
"define the Legal Review once, drop it into three workflows" — without a second
execution engine.

Runtime reference-based call-activities (an embedded flow that keeps its own
version and spawns child instances) are a phase-B concern (SpiffWorkflow), not
this.
"""

from __future__ import annotations

import copy
from uuid import uuid4

from app.db.models import WorkflowDefinition


class SubprocessError(ValueError):
    pass


def insert_subprocess(target: WorkflowDefinition, source: WorkflowDefinition) -> int:
    """Append `source`'s steps + internal routing into `target` (a draft). Returns step count.

    ponytail: steps are appended at the end and the manager reorders in the editor —
    no insert-at-position in v1. Carried routing references the source's form fields;
    where the target form lacks them the condition is simply inert (safe).
    """
    if target.status != "draft":
        raise SubprocessError("Only a draft workflow can receive a sub-process")
    if source.id == target.id or source.family_id == target.family_id:
        raise SubprocessError("A workflow cannot embed itself")

    src_steps = [s for s in (source.steps or []) if isinstance(s, dict) and s.get("id")]
    if not src_steps:
        raise SubprocessError("Source workflow has no steps to insert")

    token = uuid4().hex[:8]
    id_map = {s["id"]: f"sub_{token}_{s['id']}" for s in src_steps}

    new_steps: list[dict] = []
    for s in src_steps:
        clone = copy.deepcopy(s)
        clone["id"] = id_map[s["id"]]
        clone["name"] = f"{source.name}: {s.get('name', s['id'])}"
        new_steps.append(clone)

    new_rules: list[dict] = []
    for rule in (source.routing_rules or []):
        if not isinstance(rule, dict):
            continue
        skip_to = id_map.get(rule.get("skip_to"))
        if not skip_to:  # drop rules that point outside the copied steps
            continue
        clone = copy.deepcopy(rule)
        clone["skip_to"] = skip_to
        new_rules.append(clone)

    target.steps = (target.steps or []) + new_steps
    target.routing_rules = (target.routing_rules or []) + new_rules
    return len(new_steps)


if __name__ == "__main__":  # self-check: namespacing + routing remap, no collision
    from types import SimpleNamespace as NS

    src = NS(
        id="s-id", family_id="s-fam", name="Legal Review",
        steps=[{"id": "a", "name": "Counsel"}, {"id": "b", "name": "GC"}],
        routing_rules=[{"when": {"field": "amount", "op": "gt", "value": 1000}, "skip_to": "b"},
                       {"when": {"field": "x", "op": "eq", "value": 1}, "skip_to": "external"}],
    )
    tgt = NS(id="t-id", family_id="t-fam", status="draft",
             steps=[{"id": "a", "name": "Existing"}], routing_rules=[])
    n = insert_subprocess(tgt, src)
    assert n == 2
    ids = [s["id"] for s in tgt.steps]
    assert ids[0] == "a" and ids[1].endswith("_a") and ids[2].endswith("_b")  # no collision with existing "a"
    assert len(tgt.routing_rules) == 1  # the rule pointing outside the copy was dropped
    assert tgt.routing_rules[0]["skip_to"] == ids[2]
    try:
        insert_subprocess(NS(id="x", family_id="f", status="draft", steps=[], routing_rules=[]),
                          NS(id="y", family_id="f", name="z", steps=[{"id": "a", "name": "A"}], routing_rules=[]))
        raise AssertionError("self-embed should fail")
    except SubprocessError:
        pass
    print("subprocesses self-check OK")
