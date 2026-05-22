"""Submit flows across workflow form shapes."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture
def originator_headers():
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "originator@demo.wizflow.biz", "password": "changeme"},
    )
    if r.status_code != 200:
        pytest.skip("Database not seeded")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_list_workflows_includes_form_schema(originator_headers) -> None:
    r = client.get("/api/v1/workflows?status=published", headers=originator_headers)
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    leave = next((w for w in items if "Leave" in w["name"]), None)
    assert leave is not None, "Leave Approval workflow should be seeded"
    fields = leave.get("form_schema", {}).get("fields") or []
    assert len(fields) >= 3
    keys = {f["key"] for f in fields}
    assert "start_date" in keys
    assert "end_date" in keys


def test_submit_leave_request(originator_headers) -> None:
    listed = client.get("/api/v1/workflows?status=published", headers=originator_headers).json()
    leave = next(w for w in listed if "Leave" in w["name"])
    sub = client.post(
        f"/api/v1/workflows/{leave['id']}/submit",
        headers=originator_headers,
        json={
            "data": {
                "start_date": "2026-06-01",
                "end_date": "2026-06-10",
                "leave_type": "Annual",
                "reason": "Family trip",
            }
        },
    )
    assert sub.status_code == 201, sub.text
    assert sub.json()["status"] == "in_progress"


def test_submit_leave_missing_field_returns_400(originator_headers) -> None:
    listed = client.get("/api/v1/workflows?status=published", headers=originator_headers).json()
    leave = next(w for w in listed if "Leave" in w["name"])
    sub = client.post(
        f"/api/v1/workflows/{leave['id']}/submit",
        headers=originator_headers,
        json={"data": {"leave_type": "Annual"}},
    )
    assert sub.status_code == 400
    assert "Start date" in sub.json()["detail"] or "start" in sub.json()["detail"].lower()
