from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, Header, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.security import ACCESS_TYPE, decode_token
from app.db.models import ApiKey, User, UserRole
from app.db.session import get_db
from app.services.api_keys import has_scope, resolve_api_key

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    id: UUID
    email: str
    full_name: str
    company_id: UUID | None
    roles: list[str]


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> CurrentUser:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(creds.credentials)
        if payload.get("type") != ACCESS_TYPE:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
        user_id = UUID(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.scalar(
        select(User)
        .where(User.id == user_id, User.is_active.is_(True))
        .options(joinedload(User.user_roles).joinedload(UserRole.role))
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    roles = [ur.role.slug for ur in user.user_roles if ur.role]
    return CurrentUser(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        company_id=user.company_id,
        roles=roles,
    )


def require_company(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")
    return user


def require_roles(*allowed: str):
    def checker(user: CurrentUser = Depends(require_company)) -> CurrentUser:
        if not any(r in allowed for r in user.roles):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return checker


@dataclass
class ApiKeyContext:
    key_id: UUID
    company_id: UUID
    service_user_id: UUID
    scopes: list[str]


def get_api_key_context(
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> ApiKeyContext:
    if not x_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key required")
    row = resolve_api_key(db, x_api_key)
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    return ApiKeyContext(
        key_id=row.id,
        company_id=row.company_id,
        service_user_id=row.service_user_id,
        scopes=list(row.scopes or []),
    )


def require_api_scope(scope: str):
    def checker(ctx: ApiKeyContext = Depends(get_api_key_context), db: Session = Depends(get_db)) -> ApiKeyContext:
        row = db.get(ApiKey, ctx.key_id)
        if not row or not has_scope(row, scope):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Scope '{scope}' required")
        return ctx

    return checker
