from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.phase1 import CompanyBranding, NotificationPreferences


class LoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str
    code: str | None = None  # TOTP 2FA code, required when the user has 2FA enabled


class TwoFactorCode(BaseModel):
    code: str = Field(min_length=6, max_length=10)


class TwoFactorSetupOut(BaseModel):
    secret: str
    otpauth_uri: str


class TwoFactorStatusOut(BaseModel):
    enabled: bool


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
    two_factor_enabled: bool = False
    notification_preferences: NotificationPreferences = Field(
        default_factory=lambda: NotificationPreferences()
    )
    company_branding: CompanyBranding = Field(default_factory=lambda: CompanyBranding())


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10)
    new_password: str = Field(min_length=8)


class ResetTokenValidateOut(BaseModel):
    valid: bool
    email: str | None = None


class MessageResponse(BaseModel):
    message: str
