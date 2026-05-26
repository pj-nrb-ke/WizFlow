from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.phase1 import CompanyBranding, NotificationPreferences


class LoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class UserProfile(BaseModel):
    id: UUID
    email: str
    full_name: str
    company_id: UUID | None
    company_name: str | None
    roles: list[str]
    notification_preferences: NotificationPreferences = Field(
        default_factory=lambda: NotificationPreferences()
    )
    company_branding: CompanyBranding = Field(default_factory=lambda: CompanyBranding())
