import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture
def admin_headers():
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@demo.wizflow.biz", "password": "changeme"},
    )
    if r.status_code != 200:
        pytest.skip("Database not seeded")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def originator_headers():
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "originator@demo.wizflow.biz", "password": "changeme"},
    )
    if r.status_code != 200:
        pytest.skip("Originator user not seeded")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_submit_and_approve(admin_headers, originator_headers) -> None:
    wfs = client.get("/api/v1/workflows?status=published", headers=originator_headers)
    if wfs.status_code != 200 or not wfs.json():
        pytest.skip("No published workflow")
    petty = next((w for w in wfs.json() if "Petty Cash" in w["name"]), wfs.json()[0])
    wf_id = petty["id"]

    sub = client.post(
        f"/api/v1/workflows/{wf_id}/submit",
        headers=originator_headers,
        json={"data": {"amount": 3000, "purpose": "Office supplies", "department": "IT"}},
    )
    assert sub.status_code == 201
    req_id = sub.json()["id"]
    assert sub.json()["status"] == "in_progress"

    inbox = client.get("/api/v1/inbox", headers=admin_headers)
    assert inbox.status_code == 200
    assert any(i["request_id"] == req_id for i in inbox.json())

    appr = client.post(
        f"/api/v1/requests/{req_id}/approve",
        headers=admin_headers,
        json={"comment": "Looks good"},
    )
    assert appr.status_code == 200

    events = client.get(f"/api/v1/requests/{req_id}/events", headers=originator_headers)
    assert events.status_code == 200
    types = [e["event_type"] for e in events.json()]
    assert "request.submitted" in types
    assert "step.approved" in types


def test_request_more_info_flow(admin_headers, originator_headers) -> None:
    """REQ-1: approver asks for info, originator answers, request stays in progress."""
    wfs = client.get("/api/v1/workflows?status=published", headers=originator_headers)
    if wfs.status_code != 200 or not wfs.json():
        pytest.skip("No published workflow")
    petty = next((w for w in wfs.json() if "Petty Cash" in w["name"]), wfs.json()[0])

    sub = client.post(
        f"/api/v1/workflows/{petty['id']}/submit",
        headers=originator_headers,
        json={"data": {"amount": 1500, "purpose": "Info flow test", "department": "IT"}},
    )
    assert sub.status_code == 201, sub.text
    req_id = sub.json()["id"]

    # Approver asks for more info — request stays in_progress and in the inbox.
    ask = client.post(
        f"/api/v1/requests/{req_id}/request-info",
        headers=admin_headers,
        json={"comment": "Please attach the quotation."},
    )
    assert ask.status_code == 200, ask.text
    assert ask.json()["status"] == "in_progress"
    inbox = client.get("/api/v1/inbox", headers=admin_headers)
    assert any(i["request_id"] == req_id for i in inbox.json())

    # Empty question rejected; originator can't ask (not an approver).
    assert client.post(
        f"/api/v1/requests/{req_id}/request-info", headers=admin_headers, json={"comment": ""}
    ).status_code == 400
    assert client.post(
        f"/api/v1/requests/{req_id}/request-info", headers=originator_headers, json={"comment": "x"}
    ).status_code == 400

    # Originator answers; approver (not originator) cannot answer.
    ans = client.post(
        f"/api/v1/requests/{req_id}/answer-info",
        headers=originator_headers,
        json={"comment": "Quotation attached."},
    )
    assert ans.status_code == 200, ans.text
    assert client.post(
        f"/api/v1/requests/{req_id}/answer-info", headers=admin_headers, json={"comment": "x"}
    ).status_code == 400

    types = [
        e["event_type"]
        for e in client.get(f"/api/v1/requests/{req_id}/events", headers=originator_headers).json()
    ]
    assert "step.info_requested" in types
    assert "request.info_answered" in types

    # Still actionable — a normal approve closes it.
    assert client.post(f"/api/v1/requests/{req_id}/approve", headers=admin_headers, json={}).status_code == 200
