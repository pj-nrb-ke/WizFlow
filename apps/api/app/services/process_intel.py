"""Lite process intelligence + improvement loop (D5).

Computed entirely from history WizFlow already records — WorkflowInstance rows and the
WorkflowEvent log (step.started / step.approved / step.returned / workflow.completed) —
so there's no separate mining engine or event store. For one workflow it derives:

  * status counts and average/median cycle time,
  * rework rate (share of cases sent back at least once),
  * process variants (the distinct paths cases actually take), and
  * the bottleneck step (highest average dwell).

Then the AI narrates the picture and proposes ONE concrete change. Applying it stays a
human action through the normal designer → publish flow — this only recommends.

ponytail: an O(instances × events) scan, fine at this scale; precompute if a workflow
accumulates very large history.
"""

from __future__ import annotations

import logging
import statistics
from collections import Counter, defaultdict
from uuid import UUID

from sqlalchemy import select

from app.db.models import WorkflowDefinition, WorkflowEvent, WorkflowInstance
from app.services import ai_client, ai_gateway
from app.services.ai_client import AiError

logger = logging.getLogger(__name__)

_DECISION = {"step.approved", "step.rejected", "step.returned", "step.timer_elapsed", "step.service_done", "workflow.completed"}


def _instance_metrics(events: list[dict]) -> dict:
    """Per-instance: dwell seconds per step, the variant path, and rework count.
    ``events`` are one instance's events sorted by time ascending."""
    dwell: dict[str, float] = {}
    names: dict[str, str] = {}
    variant: list[str] = []
    for i, e in enumerate(events):
        if e["type"] != "step.started":
            continue
        sid = e.get("step_id") or "?"
        names[sid] = e.get("step_name") or sid
        variant.append(names[sid])
        for e2 in events[i + 1 :]:
            if e2["type"] in _DECISION:
                dt = (e2["t"] - e["t"]).total_seconds()
                if dt >= 0:
                    dwell[sid] = dt
                break
    returned = sum(1 for e in events if e["type"] == "step.returned")
    return {"dwell": dwell, "names": names, "variant": tuple(variant), "returned": returned}


def analyze(db, company_id: UUID, defn: WorkflowDefinition) -> dict:
    instances = db.scalars(
        select(WorkflowInstance).where(
            WorkflowInstance.company_id == company_id,
            WorkflowInstance.workflow_definition_id == defn.id,
        )
    ).all()
    events = db.scalars(
        select(WorkflowEvent)
        .where(WorkflowEvent.company_id == company_id, WorkflowEvent.workflow_definition_id == defn.id)
        .order_by(WorkflowEvent.created_at.asc())
    ).all()

    ev_by_inst: dict = defaultdict(list)
    completed_at: dict = {}
    for ev in events:
        if not ev.instance_id:
            continue
        ev_by_inst[ev.instance_id].append(
            {"type": ev.event_type, "step_id": (ev.payload or {}).get("step_id"),
             "step_name": (ev.payload or {}).get("step_name"), "t": ev.created_at}
        )
        if ev.event_type == "workflow.completed":
            completed_at[ev.instance_id] = ev.created_at

    id_to_name = {str(s.get("id")): s.get("name") for s in (defn.steps or []) if isinstance(s, dict) and s.get("id")}

    status_counts: Counter = Counter()
    dwell_secs: dict = defaultdict(list)
    step_names: dict = dict(id_to_name)
    variants: Counter = Counter()
    rework_instances = 0
    submitted_total = 0
    cycle_hours: list[float] = []

    for inst in instances:
        status_counts[inst.status] += 1
        m = _instance_metrics(ev_by_inst.get(inst.id, []))
        step_names.update(m["names"])
        for sid, secs in m["dwell"].items():
            dwell_secs[sid].append(secs)
        if m["variant"]:
            submitted_total += 1
            variants[m["variant"]] += 1
        if m["returned"] > 0:
            rework_instances += 1
        done = completed_at.get(inst.id)
        if done and inst.submitted_at:
            hrs = (done - inst.submitted_at).total_seconds() / 3600.0
            if hrs >= 0:
                cycle_hours.append(hrs)

    # bottleneck: highest average dwell (require >=1 sample)
    bottleneck = None
    avg_dwell = []
    for sid, samples in dwell_secs.items():
        avg_h = sum(samples) / len(samples) / 3600.0
        avg_dwell.append({"step": step_names.get(sid, sid), "avg_hours": round(avg_h, 2), "samples": len(samples)})
    avg_dwell.sort(key=lambda d: d["avg_hours"], reverse=True)
    if avg_dwell:
        bottleneck = avg_dwell[0]

    top_variants = [
        {"path": list(path), "count": count, "has_rework": any("return" in str(p).lower() for p in path) or False}
        for path, count in variants.most_common(5)
    ]

    return {
        "total": len(instances),
        "status_counts": dict(status_counts),
        "completed": status_counts.get("approved", 0),
        "rejected": status_counts.get("rejected", 0),
        "in_progress": status_counts.get("in_progress", 0),
        "avg_cycle_hours": round(statistics.mean(cycle_hours), 2) if cycle_hours else None,
        "median_cycle_hours": round(statistics.median(cycle_hours), 2) if cycle_hours else None,
        "rework_rate": round(rework_instances / submitted_total, 3) if submitted_total else 0.0,
        "variants": top_variants,
        "distinct_variants": len(variants),
        "bottleneck": bottleneck,
        "step_dwell": avg_dwell[:6],
    }


def _fallback_narrative(defn: WorkflowDefinition, m: dict) -> dict:
    bits = [f"{defn.name}: {m['total']} case(s), {m['completed']} completed, {m['in_progress']} in progress."]
    if m["avg_cycle_hours"] is not None:
        bits.append(f"Average cycle time is {m['avg_cycle_hours']}h.")
    if m["rework_rate"]:
        bits.append(f"Rework rate is {round(m['rework_rate'] * 100)}%.")
    suggestion = None
    if m["bottleneck"] and m["bottleneck"]["avg_hours"] > 0:
        suggestion = {
            "title": f"Address the bottleneck at '{m['bottleneck']['step']}'",
            "detail": f"This step averages {m['bottleneck']['avg_hours']}h. Consider a tighter SLA, reassignment, or parallelising it.",
        }
    elif m["rework_rate"] and m["rework_rate"] > 0.2:
        suggestion = {"title": "Reduce rework", "detail": "Many cases are returned — clarify the form or add validation so submissions arrive complete."}
    return {"narrative": " ".join(bits), "suggestion": suggestion, "ai_used": False}


_SYSTEM = (
    "You are a process-improvement analyst for a workflow tool. Given mined metrics for ONE "
    "workflow (status counts, cycle time, rework rate, variants, bottleneck step), explain what "
    "is happening in 2-3 short paragraphs for a manager, then propose exactly ONE concrete, "
    "actionable change. Use only the numbers given; do not invent data. Output JSON only: "
    "{narrative: string, suggestion: {title: string, detail: string}}."
)


def report(db, company_id: UUID, defn: WorkflowDefinition) -> dict:
    metrics = analyze(db, company_id, defn)
    base = {"workflow_id": str(defn.id), "workflow_name": defn.name, "metrics": metrics}
    if metrics["total"] == 0 or not ai_client.is_configured():
        return {**base, **_fallback_narrative(defn, metrics)}
    user = f"Workflow: {defn.name}\nMetrics (JSON):\n{metrics}"
    try:
        raw = ai_gateway.run(
            task=ai_gateway.TASK_PROCESS_IMPROVE, system=_SYSTEM, user=user,
            company_id=company_id, json_mode=True, temperature=0.3, max_tokens=800,
        )
        data = ai_client.parse_json(raw)
        sugg = data.get("suggestion") if isinstance(data.get("suggestion"), dict) else None
        return {
            **base,
            "narrative": str(data.get("narrative") or "")[:2000],
            "suggestion": {"title": str(sugg.get("title", ""))[:200], "detail": str(sugg.get("detail", ""))[:800]} if sugg else None,
            "ai_used": True,
        }
    except (AiError, ValueError, KeyError) as e:
        logger.warning("process_intel narrative fell back for %s: %s", defn.id, e)
        return {**base, **_fallback_narrative(defn, metrics)}


if __name__ == "__main__":  # self-check: per-instance mining (no DB/AI)
    from datetime import datetime, timedelta, timezone

    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    evs = [
        {"type": "request.submitted", "step_id": None, "step_name": None, "t": t0},
        {"type": "step.started", "step_id": "s1", "step_name": "Manager", "t": t0},
        {"type": "step.returned", "step_id": "s1", "step_name": None, "t": t0 + timedelta(hours=2)},
        {"type": "step.started", "step_id": "s1", "step_name": "Manager", "t": t0 + timedelta(hours=3)},
        {"type": "step.approved", "step_id": "s1", "step_name": None, "t": t0 + timedelta(hours=4)},
        {"type": "workflow.completed", "step_id": None, "step_name": None, "t": t0 + timedelta(hours=4)},
    ]
    m = _instance_metrics(evs)
    assert m["returned"] == 1, m
    assert m["variant"] == ("Manager", "Manager"), m["variant"]
    assert m["dwell"]["s1"] == 3600.0, m["dwell"]  # last start→approve = 1h (revisit overwrites)
    assert _instance_metrics([])["variant"] == ()
    print("process_intel self-check OK")
