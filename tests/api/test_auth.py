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
