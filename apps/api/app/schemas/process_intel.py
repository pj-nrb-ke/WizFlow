"""Schemas for process intelligence (D5)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class StepDwell(BaseModel):
    step: str
    avg_hours: float
    samples: int


class Variant(BaseModel):
    path: list[str] = Field(default_factory=list)
    count: int
    has_rework: bool = False


class Bottleneck(BaseModel):
    step: str
    avg_hours: float
    samples: int


class Metrics(BaseModel):
    total: int
    status_counts: dict = Field(default_factory=dict)
    completed: int = 0
    rejected: int = 0
    in_progress: int = 0
    avg_cycle_hours: float | None = None
    median_cycle_hours: float | None = None
    rework_rate: float = 0.0
    variants: list[Variant] = Field(default_factory=list)
    distinct_variants: int = 0
    bottleneck: Bottleneck | None = None
    step_dwell: list[StepDwell] = Field(default_factory=list)


class Suggestion(BaseModel):
    title: str
    detail: str


class ReportOut(BaseModel):
    workflow_id: str
    workflow_name: str
    metrics: Metrics
    narrative: str = ""
    suggestion: Suggestion | None = None
    ai_used: bool = False
