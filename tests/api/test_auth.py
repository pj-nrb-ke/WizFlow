import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture
def auth_headers():
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@demo.wizflow.biz", "password": "changeme"},
    )
    if r.status_code != 200:
        pytest.skip("Database not seeded — run migrations and seed")
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_login_invalid() -> None:
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@demo.wizflow.biz", "password": "wrong"},
    )
    assert r.status_code == 401


def test_me(auth_headers) -> None:
    r = client.get("/api/v1/auth/me", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "admin@demo.wizflow.biz"
    assert "company_admin" in body["roles"]


def test_change_password_wrong_current(auth_headers) -> None:
    r = client.post(
        "/api/v1/auth/change-password",
        headers=auth_headers,
        json={"current_password": "definitely-not-it", "new_password": "newpass12345"},
    )
    assert r.status_code == 400


def test_change_password_roundtrip(auth_headers) -> None:
    """Change the password, confirm the new one logs in, then restore the seed."""
    new_pw = "Wiz-ChangePw-Test-123"
    r = client.post(
        "/api/v1/auth/change-password",
        headers=auth_headers,
        json={"current_password": "changeme", "new_password": new_pw},
    )
    assert r.status_code == 200, r.text
    try:
        relog = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@demo.wizflow.biz", "password": new_pw},
        )
        assert relog.status_code == 200
    finally:
        # Always restore the seeded password so the rest of the suite can log in.
        relog = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@demo.wizflow.biz", "password": new_pw},
        )
        if relog.status_code == 200:
            h = {"Authorization": f"Bearer {relog.json()['access_token']}"}
            client.post(
                "/api/v1/auth/change-password",
                headers=h,
                json={"current_password": new_pw, "new_password": "changeme"},
            )
