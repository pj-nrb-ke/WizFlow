"""Schema for the request/approver copilot (D2)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CopilotFlag(BaseModel):
    severity: str = "info"
    text: str


class CopilotRecommendation(BaseModel):
    decision: str = "none"
    rationale: str = ""
    confidence: str = "low"


class CopilotRelated(BaseModel):
    reference: str
    status: str
    amount: str | None = None


class CopilotOut(BaseModel):
    summary: str = ""
    missing_info: list[str] = Field(default_factory=list)
    flags: list[CopilotFlag] = Field(default_factory=list)
    recommendation: CopilotRecommendation = Field(default_factory=CopilotRecommendation)
    related: list[CopilotRelated] = Field(default_factory=list)
    ai_used: bool = False
