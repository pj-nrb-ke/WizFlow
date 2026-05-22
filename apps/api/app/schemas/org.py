from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str | None = Field(default=None, max_length=50)


class DepartmentOut(BaseModel):
    id: UUID
    name: str
    code: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class BranchCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str | None = None


class BranchOut(BaseModel):
    id: UUID
    name: str
    code: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=1, max_length=200)
    role_slugs: list[str] = Field(default_factory=list)


class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: str
    is_active: bool
    roles: list[str]

    model_config = {"from_attributes": True}


class RoleOut(BaseModel):
    id: UUID
    slug: str
    name: str

    model_config = {"from_attributes": True}
