from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.deps import CurrentUser, get_current_user
from app.core.security import (
    REFRESH_TYPE,
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.db.models import Company, User, UserRole
from app.db.session import get_db
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse, UserProfile
from app.schemas.phase1 import CompanyBranding, NotificationPreferences
from app.services.company_settings import branding_from_settings, user_notification_preferences
from app.services.security_audit import log_security_event

router = APIRouter(prefix="/auth", tags=["Auth"])


def _user_roles(db: Session, user: User) -> list[str]:
    user = db.scalar(
        select(User)
        .where(User.id == user.id)
        .options(joinedload(User.user_roles).joinedload(UserRole.role))
    )
    return [ur.role.slug for ur in (user.user_roles if user else []) if ur.role]


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    if request.client:
        return request.client.host
    return None


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    email = body.email.strip().lower()
    user = db.scalar(
        select(User)
        .where(User.email == email, User.is_active.is_(True))
        .options(joinedload(User.user_roles).joinedload(UserRole.role))
    )
    if not user or not verify_password(body.password, user.password_hash):
        log_security_event(
            db,
            action="auth.login_failed",
            detail={"email": email},
            ip_address=_client_ip(request),
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    log_security_event(
        db,
        action="auth.login_success",
        company_id=user.company_id,
        actor_user_id=user.id,
        ip_address=_client_ip(request),
    )
    db.commit()

    roles = [ur.role.slug for ur in user.user_roles if ur.role]
    access = create_access_token(str(user.id), user.company_id, roles)
    refresh = create_refresh_token(str(user.id), user.company_id, roles)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.jwt_expire_minutes * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != REFRESH_TYPE:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        user_id = UUID(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    roles = _user_roles(db, user)
    return TokenResponse(
        access_token=create_access_token(str(user.id), user.company_id, roles),
        refresh_token=create_refresh_token(str(user.id), user.company_id, roles),
        expires_in=settings.jwt_expire_minutes * 60,
    )


@router.get("/me", response_model=UserProfile)
def me(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)) -> UserProfile:
    company_name = None
    branding = CompanyBranding()
    db_user = db.get(User, user.id)
    prefs = NotificationPreferences(**user_notification_preferences(db_user)) if db_user else NotificationPreferences()
    if user.company_id:
        company = db.get(Company, user.company_id)
        if company:
            company_name = company.name
            branding = CompanyBranding(**branding_from_settings(company.settings))
    return UserProfile(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        company_id=user.company_id,
        company_name=company_name,
        roles=user.roles,
        notification_preferences=prefs,
        company_branding=branding,
    )
