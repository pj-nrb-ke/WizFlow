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
        pytest.skip("Database not seeded")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_ai_draft_purchase(auth_headers) -> None:
    r = client.post(
        "/api/v1/ai/workflow/draft",
        headers=auth_headers,
        json={
            "description": "Purchase request workflow with manager and finance approval over 10000"
        },
    )
    assert r.status_code == 200
    draft = r.json()["draft"]
    assert "Purchase" in draft.get("name", "") or draft.get("steps")
