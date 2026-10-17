"""Schemas for Suites — no-code "applications" that group published processes."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SuiteProcessOut(BaseModel):
    """A member process of a suite, resolved to its current workflow.

    ``workflow_id`` is the currently-published definition to launch (None when the
    family has no published version). ``status`` is published / draft / unavailable.
    """

    family_id: UUID
    workflow_id: UUID | None = None
    name: str
    status: str
    description: str | None = None
    category: str | None = None
    position: int = 0
    can_initiate: bool = True


class SuiteOut(BaseModel):
    id: UUID
    name: str
    slug: str
    description: str | None = None
    icon: str | None = None
    accent: str | None = None
    status: str
    position: int
    item_count: int
    items: list[SuiteProcessOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class SuiteCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    icon: str | None = Field(default=None, max_length=40)
    accent: str | None = Field(default=None, max_length=20)
    family_ids: list[UUID] = Field(default_factory=list)


class SuiteUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    icon: str | None = Field(default=None, max_length=40)
    accent: str | None = Field(default=None, max_length=20)
    status: str | None = Field(default=None, pattern="^(draft|published)$")


class SuiteItemsUpdate(BaseModel):
    """Wholesale set of a suite's ordered member processes (by workflow family id)."""

    family_ids: list[UUID] = Field(default_factory=list)


class SuiteReorder(BaseModel):
    ordered_ids: list[UUID]


# ── Launcher (end-user view) ─────────────────────────────────────────────────
class SuiteLauncherOut(BaseModel):
    id: UUID
    name: str
    slug: str
    description: str | None = None
    icon: str | None = None
    accent: str | None = None
    processes: list[SuiteProcessOut] = Field(default_factory=list)


class LauncherOut(BaseModel):
    suites: list[SuiteLauncherOut] = Field(default_factory=list)
    ungrouped: list[SuiteProcessOut] = Field(default_factory=list)


# ── Starter templates ────────────────────────────────────────────────────────
class SuiteTemplateOut(BaseModel):
    id: str
    name: str
    description: str
    icon: str | None = None
    process_names: list[str] = Field(default_factory=list)
    process_count: int


class SuiteTemplateCloneOut(BaseModel):
    suite_id: UUID
    name: str
    created_workflows: int
