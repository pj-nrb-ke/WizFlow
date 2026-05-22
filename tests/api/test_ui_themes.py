import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.ui_settings import attach_ui_snapshot, suggest_ui_for_workflow_name, WIZFLOW_UI_KEY

client = TestClient(app)


def test_suggest_ui_for_leave() -> None:
    ui = suggest_ui_for_workflow_name("Leave Approval")
    assert ui["ui_theme"] == "people"
    assert ui["form_layout"] == "sectioned"


def test_attach_ui_snapshot() -> None:
    data = attach_ui_snapshot({"amount": 100}, {"ui_theme": "finance", "form_layout": "highlight-amount"})
    assert data["amount"] == 100
    assert data[WIZFLOW_UI_KEY]["ui_theme"] == "finance"


@pytest.fixture
def auth_headers():
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@demo.wizflow.biz", "password": "changeme"},
    )
    if r.status_code != 200:
        pytest.skip("Database not seeded")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_request_includes_ui_fields(auth_headers) -> None:
    reqs = client.get("/api/v1/requests", headers=auth_headers)
    if reqs.status_code != 200 or not reqs.json():
        pytest.skip("No requests")
    rid = reqs.json()[0]["id"]
    detail = client.get(f"/api/v1/requests/{rid}", headers=auth_headers)
    assert detail.status_code == 200
    body = detail.json()
    assert body.get("ui_theme") in ("corporate", "executive", "operations", "people", "finance")
    assert body.get("form_layout") in ("stacked", "sectioned", "two-column", "highlight-amount")
