from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class UserGroupMemberOut(BaseModel):
    user_id: UUID
    full_name: str
    email: str


class UserGroupOut(BaseModel):
    id: UUID
    name: str
    member_count: int = 0
    members: list[UserGroupMemberOut] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}


class UserGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    user_ids: list[UUID] = Field(default_factory=list)


class UserGroupUpdate(BaseModel):
    name: str | None = None
    user_ids: list[UUID] | None = None


class OrgUserOut(BaseModel):
    id: UUID
    email: str
    full_name: str


class ApproverChainItem(BaseModel):
    type: str = Field(pattern="^(user|group)$")
    id: UUID


class InitiatorConfig(BaseModel):
    everyone: bool = False
    user_ids: list[UUID] = Field(default_factory=list)
    group_ids: list[UUID] = Field(default_factory=list)


class CustomWorkflowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    attached_form_workflow_id: UUID
    initiator: InitiatorConfig
    approver_chain: list[ApproverChainItem] = Field(min_length=1)


class NameCheckOut(BaseModel):
    name: str
    available: bool


class OrgDirectoryOut(BaseModel):
    users: list[OrgUserOut]
    groups: list[UserGroupOut]
