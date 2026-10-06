"""Schemas for AI-generated apps from requirements packs (D4)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class GenerateIn(BaseModel):
    requirements: str = Field(min_length=1)
    title: str | None = None


class AppPlan(BaseModel):
    """The reviewable plan. Flexible structures (dicts) so a user-edited plan round-trips
    cleanly back to create; the create service re-normalises everything on write."""

    name: str = "Generated App"
    summary: str = ""
    entities: list[dict] = Field(default_factory=list)
    workflow: dict = Field(default_factory=dict)
    record_entity: str | None = None
    traceability: list[dict] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class CreatedEntity(BaseModel):
    id: str
    slug: str
    name: str
    reused: bool = False


class CreateOut(BaseModel):
    workflow_id: str
    workflow_name: str
    entities: list[CreatedEntity] = Field(default_factory=list)
    record_entity: str | None = None
    warnings: list[str] = Field(default_factory=list)
