from uuid import UUID

from fastapi import APIRouter, Body, Cookie, Depends, HTTPException, Request, Response, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.cookies import REFRESH_COOKIE, clear_auth_cookies, set_auth_cookies
from app.core.deps import CurrentUser, get_current_user
from app.core.security import (
    REFRESH_TYPE,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_totp_secret,
    totp_provisioning_uri,
    verify_password,
    verify_totp,
)
from app.db.models import Company, User, UserRole
from app.db.session import get_db
from app.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    TokenResponse,
    TwoFactorCode,
    TwoFactorSetupOut,
    TwoFactorStatusOut,
    UserProfile,
)
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
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> TokenResponse:
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

    if user.totp_enabled:
        code = (body.code or "").strip()
        if not code:
            # Password is correct but a 2FA code is required — client shows the code field.
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="two_factor_required")
        if not verify_totp(user.totp_secret, code):
            log_security_event(
                db, action="auth.2fa_failed", company_id=user.company_id,
                actor_user_id=user.id, ip_address=_client_ip(request),
            )
            db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_code")

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
    set_auth_cookies(response, access, refresh)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.jwt_expire_minutes * 60,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    clear_auth_cookies(response)


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    response: Response,
    body: RefreshRequest | None = Body(None),
    refresh_cookie: str | None = Cookie(None, alias=REFRESH_COOKIE),
    db: Session = Depends(get_db),
) -> TokenResponse:
    raw_refresh = (body.refresh_token if body else None) or refresh_cookie
    if not raw_refresh:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token required")
    try:
        payload = decode_token(raw_refresh)
        if payload.get("type") != REFRESH_TYPE:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        user_id = UUID(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    roles = _user_roles(db, user)
    access = create_access_token(str(user.id), user.company_id, roles)
    refresh = create_refresh_token(str(user.id), user.company_id, roles)
    set_auth_cookies(response, access, refresh)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
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
        two_factor_enabled=bool(db_user and db_user.totp_enabled),
        notification_preferences=prefs,
        company_branding=branding,
    )


@router.get("/2fa/status", response_model=TwoFactorStatusOut)
def two_factor_status(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)) -> TwoFactorStatusOut:
    db_user = db.get(User, user.id)
    return TwoFactorStatusOut(enabled=bool(db_user and db_user.totp_enabled))


@router.post("/2fa/setup", response_model=TwoFactorSetupOut)
def two_factor_setup(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)) -> TwoFactorSetupOut:
    db_user = db.get(User, user.id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if db_user.totp_enabled:
        raise HTTPException(status_code=400, detail="Two-factor is already enabled")
    secret = generate_totp_secret()
    db_user.totp_secret = secret  # stored pending; only active after /2fa/enable
    db.commit()
    return TwoFactorSetupOut(secret=secret, otpauth_uri=totp_provisioning_uri(secret, db_user.email))


@router.post("/2fa/enable", response_model=TwoFactorStatusOut)
def two_factor_enable(body: TwoFactorCode, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)) -> TwoFactorStatusOut:
    db_user = db.get(User, user.id)
    if not db_user or not db_user.totp_secret:
        raise HTTPException(status_code=400, detail="Start setup first")
    if not verify_totp(db_user.totp_secret, body.code):
        raise HTTPException(status_code=400, detail="Invalid code — check your authenticator app")
    db_user.totp_enabled = True
    log_security_event(db, action="auth.2fa_enabled", company_id=db_user.company_id, actor_user_id=db_user.id)
    db.commit()
    return TwoFactorStatusOut(enabled=True)


@router.post("/2fa/disable", response_model=TwoFactorStatusOut)
def two_factor_disable(body: TwoFactorCode, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)) -> TwoFactorStatusOut:
    db_user = db.get(User, user.id)
    if not db_user or not db_user.totp_enabled:
        return TwoFactorStatusOut(enabled=False)
    if not verify_totp(db_user.totp_secret, body.code):
        raise HTTPException(status_code=400, detail="Invalid code")
    db_user.totp_enabled = False
    db_user.totp_secret = None
    log_security_event(db, action="auth.2fa_disabled", company_id=db_user.company_id, actor_user_id=db_user.id)
    db.commit()
    return TwoFactorStatusOut(enabled=False)
