"""AI control plane (D1) — the one governed, metered entry point for LLM calls.

Every WizFlow AI feature calls :func:`run` instead of ``ai_client.chat`` directly.
The gateway, in order:

  1. enforces the global kill switch (``settings.ai_enabled``) and, when a company is
     known, that company's kill switch, per-feature toggle and monthly spend cap;
  2. routes the task to the right model tier (cheap vs strong);
  3. times the call and meters token usage;
  4. writes one :class:`AiCallLog` row (cost, latency, outcome) — the audit trail.

Governance refusals raise :class:`AiError` subclasses, which every caller already
catches and falls back from, so a disabled feature or a spent budget degrades
gracefully rather than erroring in a user's face.

ponytail: governance reads fail *open* (a transient DB hiccup must not take down all
AI); the global switch (no DB) still holds. Each call uses its own short-lived
session for governance + logging, so callers never thread a db/transaction through.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select

from app.config import settings
from app.db.models import AiCallLog, AiGovernance
from app.db.session import SessionLocal
from app.services import ai_client
from app.services.ai_client import AiError

logger = logging.getLogger(__name__)


class AiDisabledError(AiError):
    """Raised when the kill switch (global, company, or per-feature) blocks the call."""


class AiBudgetError(AiError):
    """Raised when the company's monthly AI spend cap has been reached."""


# ── Tasks (feature labels every call is tagged with) ──────────────────────────────
TASK_WORKFLOW_DRAFT = "workflow_draft"
TASK_REQUIREMENTS_APP = "requirements_app"
TASK_PROCESS_IMPROVE = "process_improve"
TASK_COPILOT = "copilot"
TASK_ANALYTICS_NARRATIVE = "analytics_narrative"
TASK_WORKFLOW_AI_STEP = "workflow_ai_step"
TASK_VOICE_POLISH = "voice_polish"
TASK_EMBED = "embedding"  # knowledge/RAG (D3); governed by global + company switch, not a per-feature toggle

# Reasoning-heavy tasks get the strong model tier; everything else the cheap default.
STRONG_TASKS = frozenset({TASK_WORKFLOW_DRAFT, TASK_REQUIREMENTS_APP, TASK_PROCESS_IMPROVE})

# For the admin UI: ordered {key, label, tier}. Admins can disable any of these
# per-workspace via disabled_tasks.
TASK_CATALOG: list[dict] = [
    {"key": TASK_COPILOT, "label": "Request & approver copilot", "tier": "standard"},
    {"key": TASK_REQUIREMENTS_APP, "label": "App generation from requirements", "tier": "advanced"},
    {"key": TASK_PROCESS_IMPROVE, "label": "Process improvement suggestions", "tier": "advanced"},
    {"key": TASK_WORKFLOW_DRAFT, "label": "Workflow drafting (AI creator)", "tier": "advanced"},
    {"key": TASK_ANALYTICS_NARRATIVE, "label": "Analytics narratives", "tier": "standard"},
    {"key": TASK_WORKFLOW_AI_STEP, "label": "AI steps inside workflows", "tier": "standard"},
    {"key": TASK_VOICE_POLISH, "label": "Voice-note cleanup", "tier": "standard"},
]
TASK_LABELS = {t["key"]: t["label"] for t in TASK_CATALOG}

# ── Pricing ───────────────────────────────────────────────────────────────────────
# USD per 1K tokens (input, output). ponytail: static list — update when models/prices
# change; an unknown model logs tokens with cost 0 rather than guessing. Matched by
# exact key first, then prefix (model ids carry date suffixes, e.g. -2024-07-18).
PRICING: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.00015, 0.0006),
    "gpt-4o": (0.0025, 0.01),
    "gpt-4.1-mini": (0.0004, 0.0016),
    "gpt-4.1-nano": (0.0001, 0.0004),
    "gpt-4.1": (0.002, 0.008),
    "o4-mini": (0.0011, 0.0044),
    "claude-3-5-haiku": (0.0008, 0.004),
    "claude-3-5-sonnet": (0.003, 0.015),
    "claude-3-7-sonnet": (0.003, 0.015),
    "claude-sonnet-4": (0.003, 0.015),
}


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    key = (model or "").lower()
    rate = PRICING.get(key)
    if rate is None:
        for k, v in PRICING.items():
            if key.startswith(k):
                rate = v
                break
    if rate is None:
        return 0.0
    return round(prompt_tokens / 1000 * rate[0] + completion_tokens / 1000 * rate[1], 6)


# Embedding prices: USD per 1K tokens. ponytail: static — update as needed.
EMBED_PRICING: dict[str, float] = {
    "text-embedding-3-small": 0.00002,
    "text-embedding-3-large": 0.00013,
    "text-embedding-ada-002": 0.0001,
}


def embed_cost(model: str, tokens: int) -> float:
    key = (model or "").lower()
    rate = EMBED_PRICING.get(key)
    if rate is None:
        for k, v in EMBED_PRICING.items():
            if key.startswith(k):
                rate = v
                break
    return round(tokens / 1000 * rate, 6) if rate else 0.0


def model_for_task(task: str) -> str:
    if task in STRONG_TASKS:
        return (settings.ai_strong_model or settings.ai_model).strip()
    return (settings.ai_model or "").strip()


def _month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _load_governance(session, company_id: UUID) -> AiGovernance | None:
    try:
        return session.scalar(select(AiGovernance).where(AiGovernance.company_id == company_id))
    except Exception:  # pragma: no cover - fail open on DB hiccup
        logger.warning("ai_gateway: governance load failed; proceeding", exc_info=True)
        return None


def _month_spend(session, company_id: UUID) -> float:
    try:
        total = session.scalar(
            select(func.coalesce(func.sum(AiCallLog.cost_usd), 0)).where(
                AiCallLog.company_id == company_id, AiCallLog.created_at >= _month_start()
            )
        )
        return float(total or 0)
    except Exception:  # pragma: no cover - fail open
        logger.warning("ai_gateway: spend query failed; not enforcing budget", exc_info=True)
        return 0.0


def _write_log(session, **kw) -> None:
    try:
        kw["total_tokens"] = int(kw.get("prompt_tokens", 0)) + int(kw.get("completion_tokens", 0))
        session.add(AiCallLog(**kw))
        session.commit()
    except Exception:  # pragma: no cover - logging must never break the feature
        session.rollback()
        logger.warning("ai_gateway: failed to write call log", exc_info=True)


def run(
    *,
    task: str,
    system: str,
    user: str,
    company_id: UUID | None = None,
    json_mode: bool = False,
    temperature: float = 0.3,
    max_tokens: int = 1024,
    timeout: float = 60.0,
) -> str:
    """Governed, metered, logged LLM call. Returns text; raises AiError (or a subclass)
    which callers catch to fall back."""
    if not settings.ai_enabled:
        raise AiDisabledError("AI is disabled platform-wide")
    if not ai_client.is_configured():
        raise AiError("No AI API key configured")

    session = SessionLocal()
    try:
        if company_id is not None:
            gov = _load_governance(session, company_id)
            if gov is not None:
                if not gov.ai_enabled:
                    raise AiDisabledError("AI is disabled for this workspace")
                if task in (gov.disabled_tasks or []):
                    raise AiDisabledError(f"The '{TASK_LABELS.get(task, task)}' feature is disabled for this workspace")
                budget = None if gov.monthly_budget_usd is None else float(gov.monthly_budget_usd)
                if budget is not None and budget >= 0 and _month_spend(session, company_id) >= budget:
                    raise AiBudgetError("This month's AI budget has been reached")

        model = model_for_task(task)
        t0 = time.monotonic()
        result = None
        err: Exception | None = None
        try:
            result = ai_client.complete(
                system, user, model=model, json_mode=json_mode,
                temperature=temperature, max_tokens=max_tokens, timeout=timeout,
            )
        except Exception as e:
            err = e
        latency_ms = int((time.monotonic() - t0) * 1000)

        used_model = result.model if result else model
        pin = result.prompt_tokens if result else 0
        pout = result.completion_tokens if result else 0
        _write_log(
            session,
            company_id=company_id,
            task=task,
            provider=ai_client.provider(),
            model=used_model,
            prompt_tokens=pin,
            completion_tokens=pout,
            cost_usd=estimate_cost(used_model, pin, pout),
            latency_ms=latency_ms,
            ok=err is None,
            error=(f"{type(err).__name__}: {err}"[:500] if err else None),
        )
        if err is not None:
            raise err
        return result.text
    finally:
        session.close()


def embed(texts: list[str], *, company_id: UUID | None = None) -> list[list[float]]:
    """Governed, metered embeddings (D3). Same policy as :func:`run` (global + company
    kill switch, budget) and one log row per batch. Raises AiError on refusal/failure."""
    if not settings.ai_enabled:
        raise AiDisabledError("AI is disabled platform-wide")
    if not ai_client.is_configured():
        raise AiError("No AI API key configured")
    if not texts:
        return []

    session = SessionLocal()
    try:
        if company_id is not None:
            gov = _load_governance(session, company_id)
            if gov is not None:
                if not gov.ai_enabled:
                    raise AiDisabledError("AI is disabled for this workspace")
                budget = None if gov.monthly_budget_usd is None else float(gov.monthly_budget_usd)
                if budget is not None and budget >= 0 and _month_spend(session, company_id) >= budget:
                    raise AiBudgetError("This month's AI budget has been reached")

        model = (settings.ai_embed_model or "").strip()
        t0 = time.monotonic()
        vectors: list[list[float]] = []
        tokens = 0
        err: Exception | None = None
        try:
            vectors, tokens = ai_client.embed(texts, model=model)
        except Exception as e:
            err = e
        latency_ms = int((time.monotonic() - t0) * 1000)
        _write_log(
            session,
            company_id=company_id,
            task=TASK_EMBED,
            provider=ai_client.provider(),
            model=model,
            prompt_tokens=tokens,
            completion_tokens=0,
            cost_usd=embed_cost(model, tokens),
            latency_ms=latency_ms,
            ok=err is None,
            error=(f"{type(err).__name__}: {err}"[:500] if err else None),
        )
        if err is not None:
            raise err
        return vectors
    finally:
        session.close()


def usage_summary(session, company_id: UUID) -> dict:
    """Current-calendar-month AI usage for a company: totals, per-feature breakdown,
    and the most recent calls — the data behind the AI Controls usage panel."""
    start = _month_start()
    rows = session.execute(
        select(
            AiCallLog.task,
            func.count(),
            func.coalesce(func.sum(AiCallLog.total_tokens), 0),
            func.coalesce(func.sum(AiCallLog.cost_usd), 0),
        )
        .where(AiCallLog.company_id == company_id, AiCallLog.created_at >= start)
        .group_by(AiCallLog.task)
    ).all()
    by_task = [
        {"task": t, "label": TASK_LABELS.get(t, t), "calls": int(c), "tokens": int(tok), "cost_usd": float(cost)}
        for (t, c, tok, cost) in rows
    ]
    by_task.sort(key=lambda r: r["cost_usd"], reverse=True)
    recent_rows = session.scalars(
        select(AiCallLog)
        .where(AiCallLog.company_id == company_id)
        .order_by(AiCallLog.created_at.desc())
        .limit(15)
    ).all()
    recent = [
        {
            "task": r.task,
            "label": TASK_LABELS.get(r.task, r.task),
            "model": r.model,
            "tokens": int(r.total_tokens or 0),
            "cost_usd": float(r.cost_usd or 0),
            "latency_ms": int(r.latency_ms or 0),
            "ok": bool(r.ok),
            "created_at": r.created_at,
        }
        for r in recent_rows
    ]
    return {
        "month": start.date().isoformat(),
        "total_calls": sum(r["calls"] for r in by_task),
        "total_tokens": sum(r["tokens"] for r in by_task),
        "total_cost_usd": round(sum(r["cost_usd"] for r in by_task), 4),
        "by_task": by_task,
        "recent": recent,
    }


if __name__ == "__main__":  # self-check: routing + cost (no DB / network needed)
    # routing: strong tasks use the strong model when set, else the default
    settings.ai_model = "gpt-4o-mini"
    settings.ai_strong_model = ""
    assert model_for_task(TASK_COPILOT) == "gpt-4o-mini"
    assert model_for_task(TASK_REQUIREMENTS_APP) == "gpt-4o-mini"  # falls back to default
    settings.ai_strong_model = "gpt-4o"
    assert model_for_task(TASK_REQUIREMENTS_APP) == "gpt-4o"
    assert model_for_task(TASK_COPILOT) == "gpt-4o-mini"
    # cost: exact, prefix (date suffix), and unknown → 0
    assert estimate_cost("gpt-4o-mini", 1000, 1000) == round(0.00015 + 0.0006, 6)
    assert estimate_cost("gpt-4o-mini-2024-07-18", 1000, 0) == round(0.00015, 6)
    assert estimate_cost("some-local-llama", 1000, 1000) == 0.0
    assert estimate_cost("gpt-4o", 0, 0) == 0.0
    # embedding cost: known, prefix, unknown
    assert embed_cost("text-embedding-3-small", 1000) == round(0.00002, 6)
    assert embed_cost("text-embedding-3-small-v2", 2000) == round(2 * 0.00002, 6)
    assert embed_cost("mystery-embed", 1000) == 0.0
    # every catalog task has a label and a valid tier
    assert all(t["tier"] in ("standard", "advanced") for t in TASK_CATALOG)
    assert TASK_LABELS[TASK_COPILOT]
    print("ai_gateway self-check OK")
