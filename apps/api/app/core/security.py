from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import bcrypt
from jose import JWTError, jwt

from app.config import settings

ALGORITHM = "HS256"
ACCESS_TYPE = "access"
REFRESH_TYPE = "refresh"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_token(
    *,
    subject: str,
    company_id: UUID | None,
    roles: list[str],
    token_type: str,
    expires_minutes: int,
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "company_id": str(company_id) if company_id else None,
        "roles": roles,
        "type": token_type,
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def create_access_token(subject: str, company_id: UUID | None, roles: list[str]) -> str:
    return create_token(
        subject=subject,
        company_id=company_id,
        roles=roles,
        token_type=ACCESS_TYPE,
        expires_minutes=settings.jwt_expire_minutes,
    )


def create_refresh_token(subject: str, company_id: UUID | None, roles: list[str]) -> str:
    return create_token(
        subject=subject,
        company_id=company_id,
        roles=roles,
        token_type=REFRESH_TYPE,
        expires_minutes=settings.jwt_expire_minutes * 24 * 7,
    )


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
