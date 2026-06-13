"""Background automation scheduler.

Periodically runs SLA alerts, escalations, scheduled report emails, and
recurring workflow triggers via :func:`run_all_automation`. Without this loop
those features only fire when an admin calls ``POST /phase2/automation/run``
by hand, so time-based automation never actually happens on its own.

Implementation is a single in-process ``asyncio`` loop (no extra dependency).
For multi-worker deployments run the API with a single worker, or move this to
an external trigger (cron hitting the automation endpoint) so the work is not
duplicated per worker.
"""

from __future__ import annotations

import asyncio
import logging

from app.config import settings
from app.db.session import SessionLocal
from app.services.phase2_automation import run_all_automation

logger = logging.getLogger("wizflow.scheduler")

_task: asyncio.Task | None = None


def _tick() -> None:
    """One automation pass across all companies (runs in a worker thread)."""
    db = SessionLocal()
    try:
        result = run_all_automation(db)
        if any(
            (
                result.sla_warnings,
                result.sla_breaches,
                result.escalations,
                result.reports_sent,
                result.schedules_run,
            )
        ):
            logger.info(
                "automation tick: warnings=%s breaches=%s escalations=%s reports=%s schedules=%s",
                result.sla_warnings,
                result.sla_breaches,
                result.escalations,
                result.reports_sent,
                result.schedules_run,
            )
    finally:
        db.close()


async def _loop(interval: int) -> None:
    while True:
        await asyncio.sleep(interval)
        try:
            # Run the blocking DB work off the event loop.
            await asyncio.to_thread(_tick)
        except Exception:  # pragma: no cover - defensive, keep the loop alive
            logger.exception("automation tick failed")


def start() -> None:
    """Start the background loop if enabled and not already running."""
    global _task
    if not settings.scheduler_enabled:
        logger.info("automation scheduler disabled (SCHEDULER_ENABLED=false)")
        return
    if _task is not None and not _task.done():
        return
    interval = max(30, settings.scheduler_interval_seconds)
    _task = asyncio.get_event_loop().create_task(_loop(interval))
    logger.info("automation scheduler started (interval=%ss)", interval)


async def stop() -> None:
    """Cancel the background loop (used on shutdown)."""
    global _task
    if _task is None:
        return
    _task.cancel()
    try:
        await _task
    except asyncio.CancelledError:
        pass
    _task = None
