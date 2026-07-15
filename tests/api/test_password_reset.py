"""Tests for the self-service password-reset (forgot-password) flow.

Covers: forgot-password never reveals whether an email exists but does mint a
hashed token for a real user; the validate endpoint reflects token validity;
reset actually changes the password, is single-use, and rejects expired /
invalid / reused tokens. Self-contained — builds its own throwaway company +
user and cleans them up; run against a migrated DB, never depending on demo data.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.security import hash_password
from app.db import models as m
from app.db.session import SessionLocal
from app.main import app
from app.routers.auth import _hash_reset_token

client = TestClient(app)


def _make_user(password: str = "OrigPass123") -> tuple[str, str, str]:
    db = SessionLocal()
    try:
        suffix = uuid4().hex[:8]
        company = m.Company(name=f"PwReset {suffix}", slug=f"pwreset-{suffix}", settings={})
        db.add(company)
        db.flush()
        user = m.User(
            company_id=company.id,
            email=f"pwreset-{suffix}@example.com",
            password_hash=hash_password(password),
            full_name="Reset Tester",
        )
        db.add(user)
        db.commit()
        return str(user.id), user.email, str(company.id)
    finally:
        db.close()


def _cleanup(company_id: str) -> None:
    db = SessionLocal()
    try:
        users = db.scalars(select(m.User).where(m.User.company_id == company_id)).all()
        for u in users:
            db.query(m.PasswordResetToken).filter(m.PasswordResetToken.user_id == u.id).delete()
        db.query(m.User).filter(m.User.company_id == company_id).delete(synchronize_session=False)
        db.query(m.Company).filter(m.Company.id == company_id).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _insert_token(user_id: str, raw: str, *, minutes: int = 60, used: bool = False) -> None:
    db = SessionLocal()
    try:
        db.add(
            m.PasswordResetToken(
                user_id=user_id,
                token_hash=_hash_reset_token(raw),
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=minutes),
                used_at=datetime.now(timezone.utc) if used else None,
            )
        )
        db.commit()
    finally:
        db.close()


def _token_count(user_id: str) -> int:
    db = SessionLocal()
    try:
        return len(
            db.scalars(select(m.PasswordResetToken).where(m.PasswordResetToken.user_id == user_id)).all()
        )
    finally:
        db.close()


def test_forgot_password_is_generic_for_unknown_email():
    r = client.post("/api/v1/auth/forgot-password", json={"email": f"nobody-{uuid4().hex}@example.com"})
    assert r.status_code == 200
    assert "reset link" in r.json()["message"].lower()


def test_forgot_password_mints_token_for_real_user():
    uid, email, cid = _make_user()
    try:
        assert client.post("/api/v1/auth/forgot-password", json={"email": email}).status_code == 200
        assert _token_count(uid) == 1
    finally:
        _cleanup(cid)


def test_validate_and_reset_happy_path():
    uid, email, cid = _make_user(password="OrigPass123")
    try:
        raw = "known-raw-" + uuid4().hex
        _insert_token(uid, raw)

        v = client.get("/api/v1/auth/reset-password/validate", params={"token": raw})
        assert v.status_code == 200
        assert v.json()["valid"] is True
        assert v.json()["email"] == email

        assert client.post(
            "/api/v1/auth/reset-password", json={"token": raw, "new_password": "BrandNew456"}
        ).status_code == 200

        assert client.post(
            "/api/v1/auth/login", json={"email": email, "password": "BrandNew456"}
        ).status_code == 200
        assert client.post(
            "/api/v1/auth/login", json={"email": email, "password": "OrigPass123"}
        ).status_code == 401
    finally:
        _cleanup(cid)


def test_token_is_single_use():
    uid, email, cid = _make_user()
    try:
        raw = "single-use-" + uuid4().hex
        _insert_token(uid, raw)
        assert client.post(
            "/api/v1/auth/reset-password", json={"token": raw, "new_password": "FirstReset1"}
        ).status_code == 200
        assert client.post(
            "/api/v1/auth/reset-password", json={"token": raw, "new_password": "SecondReset2"}
        ).status_code == 400
        assert client.get(
            "/api/v1/auth/reset-password/validate", params={"token": raw}
        ).json()["valid"] is False
    finally:
        _cleanup(cid)


def test_expired_token_rejected():
    uid, email, cid = _make_user()
    try:
        raw = "expired-" + uuid4().hex
        _insert_token(uid, raw, minutes=-5)
        assert client.get(
            "/api/v1/auth/reset-password/validate", params={"token": raw}
        ).json()["valid"] is False
        assert client.post(
            "/api/v1/auth/reset-password", json={"token": raw, "new_password": "Whatever12"}
        ).status_code == 400
    finally:
        _cleanup(cid)


def test_invalid_token_rejected():
    assert client.get(
        "/api/v1/auth/reset-password/validate", params={"token": "totally-bogus-token"}
    ).json()["valid"] is False
    assert client.post(
        "/api/v1/auth/reset-password", json={"token": "totally-bogus-token", "new_password": "Whatever12"}
    ).status_code == 400
