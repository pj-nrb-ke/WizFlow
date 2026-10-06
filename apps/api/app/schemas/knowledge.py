"""Schemas for the knowledge/RAG API (D3)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class KnowledgeDocOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    source: str | None = None
    chunk_count: int
    created_at: datetime


class KnowledgeDocCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    text: str = Field(min_length=1)
    source: str | None = None


class KnowledgeSearchHit(BaseModel):
    title: str
    content: str
    score: float
