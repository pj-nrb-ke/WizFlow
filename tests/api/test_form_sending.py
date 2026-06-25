"""Tests for Features 1, 2, and 8: send-form, scheduled dispatch, submission reports."""

from datetime import datetime, timedelta, timezone

import uuid as _uuid_mod

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _login(email: str = "admin@demo.wizflow.biz") -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "changeme"})
    if r.status_code != 200:
        pytest.skip(f"User {email} not seeded — run seed.py first")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin_headers():
    return _login()


@pytest.fixture(scope="module")
def published_wf_id(admin_headers):
    wfs = client.get("/api/v1/workflows?status=published", headers=admin_headers).json()
    if not wfs:
        pytest.skip("No published workflows seeded")
    return wfs[0]["id"]


@pytest.fixture(scope="module")
def draft_wf_id(admin_headers):
    wfs = client.get("/api/v1/workflows?status=draft", headers=admin_headers).json()
    if not wfs:
        pytest.skip("No draft workflows seeded")
    return wfs[0]["id"]


@pytest.fixture(scope="module")
def any_user_id(admin_headers):
    r = client.get("/api/v1/workflows/org-directory", headers=admin_headers)
    if r.status_code != 200 or not r.json().get("users"):
        pytest.skip("No users in org directory")
    return r.json()["users"][0]["id"]


# ── Feature 1: send form now ──────────────────────────────────────────────────

def test_send_form_now_empty_list(admin_headers, published_wf_id):
    """Sending to nobody returns sent=0, skipped=0."""
    r = client.post(
        f"/api/v1/workflows/{published_wf_id}/send-form",
        headers=admin_headers,
        json={"user_ids": []},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["sent"] + body["skipped"] == 0


def test_send_form_invalid_uuid_skipped(admin_headers, published_wf_id):
    r = client.post(
        f"/api/v1/workflows/{published_wf_id}/send-form",
        headers=admin_headers,
        json={"user_ids": ["not-a-uuid", "also-not"]},
    )
    assert r.status_code == 200
    assert r.json()["skipped"] == 2
    assert r.json()["sent"] == 0


def test_send_form_wrong_company_user_skipped(admin_headers, published_wf_id):
    """A UUID that doesn't belong to this company is skipped."""
    _uuid = _uuid_mod
    r = client.post(
        f"/api/v1/workflows/{published_wf_id}/send-form",
        headers=admin_headers,
        json={"user_ids": [str(_uuid.uuid4())]},
    )
    assert r.status_code == 200
    assert r.json()["skipped"] == 1


def test_send_form_to_self(admin_headers, published_wf_id):
    """Sending to current user — should either send or skip (not crash)."""
    me = client.get("/api/v1/auth/me", headers=admin_headers).json()
    r = client.post(
        f"/api/v1/workflows/{published_wf_id}/send-form",
        headers=admin_headers,
        json={"user_ids": [me["id"]]},
    )
    assert r.status_code == 200
    # sent+skipped == 1 regardless of email config
    assert r.json()["sent"] + r.json()["skipped"] == 1


def test_send_form_draft_workflow_blocked(admin_headers, draft_wf_id):
    r = client.post(
        f"/api/v1/workflows/{draft_wf_id}/send-form",
        headers=admin_headers,
        json={"user_ids": []},
    )
    assert r.status_code == 400


def test_send_form_requires_auth(published_wf_id):
    fresh = TestClient(app)
    r = fresh.post(f"/api/v1/workflows/{published_wf_id}/send-form", json={"user_ids": []})
    assert r.status_code in (401, 403)


# ── Feature 2: form schedules ─────────────────────────────────────────────────

def _future_dt() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()


def test_create_weekly_schedule(admin_headers, published_wf_id, any_user_id):
    r = client.post(
        f"/api/v1/workflows/{published_wf_id}/form-schedules",
        headers=admin_headers,
        json={
            "name": "Weekly reminder",
            "frequency": "weekly",
            "recipient_user_ids": [any_user_id],
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["frequency"] == "weekly"
    assert body["is_active"] is True
    assert any_user_id in body["recipient_user_ids"]


def test_create_monthly_schedule(admin_headers, published_wf_id, any_user_id):
    r = client.post(
        f"/api/v1/workflows/{published_wf_id}/form-schedules",
        headers=admin_headers,
        json={
            "name": "Monthly KYC",
            "frequency": "monthly",
            "recipient_user_ids": [any_user_id],
        },
    )
    assert r.status_code == 201
    assert r.json()["frequency"] == "monthly"


def test_create_once_schedule(admin_headers, published_wf_id, any_user_id):
    r = client.post(
        f"/api/v1/workflows/{published_wf_id}/form-schedules",
        headers=admin_headers,
        json={
            "name": "One-time blast",
            "frequency": "once",
            "recipient_user_ids": [any_user_id],
            "next_run_at": _future_dt(),
        },
    )
    assert r.status_code == 201
    assert r.json()["frequency"] == "once"


def test_create_once_schedule_missing_date(admin_headers, published_wf_id, any_user_id):
    """frequency=once without next_run_at should return 400."""
    r = client.post(
        f"/api/v1/workflows/{published_wf_id}/form-schedules",
        headers=admin_headers,
        json={
            "name": "Bad once",
            "frequency": "once",
            "recipient_user_ids": [any_user_id],
        },
    )
    assert r.status_code == 400


def test_create_invalid_frequency(admin_headers, published_wf_id, any_user_id):
    r = client.post(
        f"/api/v1/workflows/{published_wf_id}/form-schedules",
        headers=admin_headers,
        json={
            "name": "Invalid",
            "frequency": "hourly",
            "recipient_user_ids": [any_user_id],
        },
    )
    assert r.status_code == 400


def test_create_schedule_no_recipients(admin_headers, published_wf_id):
    r = client.post(
        f"/api/v1/workflows/{published_wf_id}/form-schedules",
        headers=admin_headers,
        json={"name": "Empty", "frequency": "weekly", "recipient_user_ids": []},
    )
    assert r.status_code == 400


def test_create_schedule_draft_blocked(admin_headers, draft_wf_id, any_user_id):
    r = client.post(
        f"/api/v1/workflows/{draft_wf_id}/form-schedules",
        headers=admin_headers,
        json={"name": "Draft", "frequency": "weekly", "recipient_user_ids": [any_user_id]},
    )
    assert r.status_code == 400


def test_list_form_schedules(admin_headers, published_wf_id, any_user_id):
    # Create one first
    client.post(
        f"/api/v1/workflows/{published_wf_id}/form-schedules",
        headers=admin_headers,
        json={"name": "List test", "frequency": "weekly", "recipient_user_ids": [any_user_id]},
    )
    r = client.get(f"/api/v1/workflows/{published_wf_id}/form-schedules", headers=admin_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) >= 1


def test_toggle_form_schedule(admin_headers, published_wf_id, any_user_id):
    cr = client.post(
        f"/api/v1/workflows/{published_wf_id}/form-schedules",
        headers=admin_headers,
        json={"name": "Toggle me", "frequency": "weekly", "recipient_user_ids": [any_user_id]},
    )
    sched_id = cr.json()["id"]
    original_active = cr.json()["is_active"]

    r = client.patch(
        f"/api/v1/workflows/{published_wf_id}/form-schedules/{sched_id}",
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["is_active"] == (not original_active)

    # Toggle back
    r2 = client.patch(
        f"/api/v1/workflows/{published_wf_id}/form-schedules/{sched_id}",
        headers=admin_headers,
    )
    assert r2.json()["is_active"] == original_active


def test_delete_form_schedule(admin_headers, published_wf_id, any_user_id):
    cr = client.post(
        f"/api/v1/workflows/{published_wf_id}/form-schedules",
        headers=admin_headers,
        json={"name": "Delete me", "frequency": "weekly", "recipient_user_ids": [any_user_id]},
    )
    sched_id = cr.json()["id"]

    r = client.delete(
        f"/api/v1/workflows/{published_wf_id}/form-schedules/{sched_id}",
        headers=admin_headers,
    )
    assert r.status_code == 204

    # Should no longer appear in list
    schedules = client.get(
        f"/api/v1/workflows/{published_wf_id}/form-schedules", headers=admin_headers
    ).json()
    ids = [s["id"] for s in schedules]
    assert sched_id not in ids


def test_delete_nonexistent_schedule(admin_headers, published_wf_id):
    _uuid = _uuid_mod
    r = client.delete(
        f"/api/v1/workflows/{published_wf_id}/form-schedules/{_uuid.uuid4()}",
        headers=admin_headers,
    )
    assert r.status_code == 404


def test_schedule_endpoints_require_auth(published_wf_id):
    fresh = TestClient(app)
    r = fresh.get(f"/api/v1/workflows/{published_wf_id}/form-schedules")
    assert r.status_code in (401, 403)


# ── Feature 8: submission report ─────────────────────────────────────────────

def test_form_report_structure(admin_headers, published_wf_id):
    r = client.get(f"/api/v1/workflows/{published_wf_id}/form-report", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    assert "workflow_id" in body
    assert "workflow_name" in body
    assert "total_responses" in body
    assert "internal_count" in body
    assert "guest_count" in body
    assert "fields" in body
    assert body["total_responses"] == body["internal_count"] + body["guest_count"]
    assert isinstance(body["fields"], list)


def test_form_report_counts_submissions(admin_headers, published_wf_id):
    """After submitting a guest response, the report guest_count increases."""
    before = client.get(
        f"/api/v1/workflows/{published_wf_id}/form-report", headers=admin_headers
    ).json()["guest_count"]

    # Get active token
    link = client.get(
        f"/api/v1/workflows/{published_wf_id}/public-link", headers=admin_headers
    ).json()
    if not link:
        link = client.post(
            f"/api/v1/workflows/{published_wf_id}/public-link", headers=admin_headers
        ).json()
    token = link["url"].split("/p/")[-1]

    _uuid = _uuid_mod
    client.post(
        f"/api/v1/public/forms/{token}/submit",
        json={
            "guest_name": "Report Tester",
            "guest_email": f"report-{_uuid.uuid4().hex[:6]}@example.com",
            "data": {},
            "honeypot": "",
        },
    )

    after = client.get(
        f"/api/v1/workflows/{published_wf_id}/form-report", headers=admin_headers
    ).json()["guest_count"]

    assert after == before + 1


def test_form_report_field_aggregations(admin_headers, published_wf_id):
    """Fields list returns correct aggregation types."""
    body = client.get(
        f"/api/v1/workflows/{published_wf_id}/form-report", headers=admin_headers
    ).json()
    for field in body["fields"]:
        assert "key" in field
        assert "label" in field
        assert "field_type" in field
        assert "aggregation" in field
        agg = field["aggregation"]
        assert "type" in agg
        assert "count" in agg
        assert agg["type"] in ("counts", "numeric", "texts", "raw")


def test_form_report_404_unknown_workflow(admin_headers):
    _uuid = _uuid_mod
    r = client.get(f"/api/v1/workflows/{_uuid.uuid4()}/form-report", headers=admin_headers)
    assert r.status_code == 404


def test_form_report_requires_auth(published_wf_id):
    fresh = TestClient(app)
    r = fresh.get(f"/api/v1/workflows/{published_wf_id}/form-report")
    assert r.status_code in (401, 403)
