from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class BusinessEntityCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    fields: list[dict] = Field(default_factory=list)


class BusinessEntityUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    fields: list[dict] | None = None


class BusinessEntitySummary(BaseModel):
    id: UUID
    name: str
    slug: str
    description: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class BusinessEntityOut(BusinessEntitySummary):
    fields: list[dict] = Field(default_factory=list)


class RecordIn(BaseModel):
    data: dict = Field(default_factory=dict)


class RecordOut(BaseModel):
    id: UUID
    entity_id: UUID
    data: dict = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
