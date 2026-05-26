"""Phase 1 Sprint 1 API tests (TestClient). Run: python -m scripts.test_phase1_api"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
PASS = "changeme"


def login(email: str = "admin@demo.wizflow.biz") -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": PASS})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_auth_me_preferences_and_branding() -> None:
    h = login()
    r = client.get("/api/v1/auth/me", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "notification_preferences" in data
    assert "email" in data["notification_preferences"]
    assert "company_branding" in data


def test_notification_preferences_patch() -> None:
    h = login()
    r = client.patch(
        "/api/v1/users/me/preferences",
        headers=h,
        json={"email": False, "in_app": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["email"] is False
    me = client.get("/api/v1/auth/me", headers=h).json()
    assert me["notification_preferences"]["email"] is False
    client.patch("/api/v1/users/me/preferences", headers=h, json={"email": True})


def test_setup_status() -> None:
    h = login()
    r = client.get("/api/v1/admin/setup-status", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "steps" in body and "percent" in body and "complete" in body
    assert "published_workflow" in body["steps"]


def test_workflow_health_check() -> None:
    h = login()
    wfs = client.get("/api/v1/workflows", headers=h).json()
    assert wfs, "no workflows"
    wf_id = wfs[0]["id"]
    r = client.get(f"/api/v1/workflows/{wf_id}/health-check", headers=h)
    assert r.status_code == 200, r.text
    assert "issues" in r.json() and "ok" in r.json()


def test_templates_list_and_clone() -> None:
    h = login()
    r = client.get("/api/v1/templates", headers=h)
    assert r.status_code == 200, r.text
    templates = r.json()
    assert len(templates) >= 10
    clone = client.post(f"/api/v1/templates/{templates[0]['id']}/clone", headers=h)
    assert clone.status_code == 201, clone.text
    assert clone.json()["status"] == "draft"


def test_requests_filters_and_export() -> None:
    h = login("originator@demo.wizflow.biz")
    r = client.get("/api/v1/requests", params={"status": "in_progress,approved"}, headers=h)
    assert r.status_code == 200, r.text
    csv_r = client.get("/api/v1/requests/export.csv", headers=h)
    assert csv_r.status_code == 200, csv_r.text
    assert "reference_number" in csv_r.text


def test_inbox_filters_and_export() -> None:
    h = login("approver1@demo.wizflow.biz")
    r = client.get("/api/v1/inbox", params={"q": "Petty"}, headers=h)
    assert r.status_code == 200, r.text
    csv_r = client.get("/api/v1/inbox/export.csv", headers=h)
    assert csv_r.status_code == 200, csv_r.text
    assert "workflow_name" in csv_r.text


def test_audit_export() -> None:
    h = login("originator@demo.wizflow.biz")
    reqs = client.get("/api/v1/requests", headers=h).json()
    if not reqs:
        return
    rid = reqs[0]["id"]
    r = client.get(f"/api/v1/requests/{rid}/audit-export", headers=h)
    assert r.status_code == 200, r.text
    assert "timestamp" in r.text


def test_workflows_and_inbox_xlsx() -> None:
    h = login()
    wf_xlsx = client.get("/api/v1/workflows/export.xlsx", headers=h)
    assert wf_xlsx.status_code == 200, wf_xlsx.text
    assert "spreadsheetml" in wf_xlsx.headers.get("content-type", "")

    h2 = login("approver1@demo.wizflow.biz")
    inbox_xlsx = client.get("/api/v1/inbox/export.xlsx", headers=h2)
    assert inbox_xlsx.status_code == 200, inbox_xlsx.text

    users = client.get("/api/v1/workflows/company-users", headers=h)
    assert users.status_code == 200, users.text
    assert isinstance(users.json(), list)


def test_inbox_priority_filter() -> None:
    h = login("approver1@demo.wizflow.biz")
    r = client.get("/api/v1/inbox", params={"priority": "normal"}, headers=h)
    assert r.status_code == 200, r.text


def test_company_branding_patch() -> None:
    h = login()
    r = client.patch(
        "/api/v1/admin/company/branding",
        headers=h,
        json={"display_name": "Demo Co", "brand_color": "#2563eb"},
    )
    assert r.status_code == 200, r.text
    me = client.get("/api/v1/auth/me", headers=h).json()
    assert me["company_branding"]["display_name"] == "Demo Co"


def main() -> None:
    test_auth_me_preferences_and_branding()
    test_notification_preferences_patch()
    test_setup_status()
    test_workflow_health_check()
    test_templates_list_and_clone()
    test_requests_filters_and_export()
    test_inbox_filters_and_export()
    test_audit_export()
    test_workflows_and_inbox_xlsx()
    test_inbox_priority_filter()
    test_company_branding_patch()
    print("All Phase 1 API tests passed.")


if __name__ == "__main__":
    main()
