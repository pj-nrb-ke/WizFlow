"""Schemas for the AI control plane admin API (D1)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class GovernanceOut(BaseModel):
    ai_enabled: bool = True
    monthly_budget_usd: float | None = None
    disabled_tasks: list[str] = Field(default_factory=list)


class GovernanceUpdate(BaseModel):
    """Full replace of the workspace policy (the admin form always posts all fields)."""

    ai_enabled: bool = True
    monthly_budget_usd: float | None = None
    disabled_tasks: list[str] = Field(default_factory=list)


class UsageByTask(BaseModel):
    task: str
    label: str
    calls: int
    tokens: int
    cost_usd: float


class UsageRecent(BaseModel):
    task: str
    label: str
    model: str
    tokens: int
    cost_usd: float
    latency_ms: int
    ok: bool
    created_at: datetime


class UsageSummaryOut(BaseModel):
    month: str
    total_calls: int
    total_tokens: int
    total_cost_usd: float
    by_task: list[UsageByTask] = Field(default_factory=list)
    recent: list[UsageRecent] = Field(default_factory=list)


class TaskInfo(BaseModel):
    key: str
    label: str
    tier: str


class OverviewOut(BaseModel):
    ai_configured: bool
    provider: str
    global_enabled: bool
    default_model: str
    strong_model: str
    governance: GovernanceOut
    usage: UsageSummaryOut
    tasks: list[TaskInfo] = Field(default_factory=list)
