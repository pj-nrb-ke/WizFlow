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


def test_list_workflows(auth_headers) -> None:
    r = client.get("/api/v1/workflows", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_preview_endpoint(auth_headers) -> None:
    listed = client.get("/api/v1/workflows", headers=auth_headers).json()
    if not listed:
        pytest.skip("No workflows seeded")
    wf_id = listed[0]["id"]
    r = client.get(f"/api/v1/workflows/{wf_id}/preview", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert "gaps" in body
    assert "form_fields" in body


def test_publish_and_simulate(auth_headers) -> None:
    listed = client.get("/api/v1/workflows", headers=auth_headers).json()
    if not listed:
        pytest.skip("No workflows seeded")
    wf_id = listed[0]["id"]
    if listed[0]["status"] == "draft":
        sim = client.post(
            f"/api/v1/workflows/{wf_id}/simulate",
            headers=auth_headers,
            json={"data": {"amount": 3000, "purpose": "Supplies"}},
        )
        assert sim.status_code == 200
        pub = client.post(
            f"/api/v1/workflows/{wf_id}/publish",
            headers=auth_headers,
            json={"confirm_preview": True, "test_completed": True},
        )
        assert pub.status_code == 200
        assert pub.json()["status"] == "published"
    else:
        sim = client.post(
            f"/api/v1/workflows/{wf_id}/simulate",
            headers=auth_headers,
            json={"data": {"amount": 3000, "purpose": "Supplies"}},
        )
        assert sim.status_code == 200
    body = sim.json()
    assert len(body["steps_traversed"]) >= 1


def test_ai_draft(auth_headers) -> None:
    r = client.post(
        "/api/v1/ai/workflow/draft",
        headers=auth_headers,
        json={"description": "Petty cash approval for small office expenses with manager sign-off"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "draft" in body
    assert body["draft"].get("steps")
