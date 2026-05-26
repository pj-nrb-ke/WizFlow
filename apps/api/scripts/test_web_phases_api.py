"""Smoke tests for Phase 1–3 web completion APIs."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def login(email: str = "admin@demo.wizflow.biz", password: str = "changeme") -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_master_data_and_drafts() -> None:
    h = login()
    cats = client.get("/api/v1/master-data/categories", headers=h)
    assert cats.status_code == 200
    assert "department" in cats.json()["categories"]

    create = client.post(
        "/api/v1/master-data",
        headers=h,
        json={"category": "department", "code": "QA-DEPT", "label": "QA Department"},
    )
    assert create.status_code == 201, create.text

    wfs = client.get("/api/v1/workflows?status=published", headers=h)
    assert wfs.status_code == 200
    wf_id = wfs.json()[0]["id"]
    draft = client.put(
        f"/api/v1/drafts/{wf_id}",
        headers=h,
        json={"workflow_definition_id": wf_id, "data": {"title": "draft test"}},
    )
    assert draft.status_code == 200, draft.text
    listed = client.get("/api/v1/drafts", headers=h)
    assert any(d["id"] == draft.json()["id"] for d in listed.json())


def test_wizard_and_compliance() -> None:
    h = login()
    q = client.post(
        "/api/v1/ai/workflow/wizard/questions",
        headers=h,
        json={"description": "Petty cash expense approval with manager and finance over 5000"},
    )
    assert q.status_code == 200, q.text
    assert len(q.json()["questions"]) >= 3

    fin = client.post(
        "/api/v1/ai/workflow/wizard/finalize",
        headers=h,
        json={
            "description": "Petty cash",
            "answers": {"sla_hours": "24", "notifications": "yes"},
        },
    )
    assert fin.status_code == 200, fin.text
    assert fin.json()["draft"]["name"]

    comp = client.get("/api/v1/analytics/compliance", headers=h)
    assert comp.status_code == 200
    assert "total_open" in comp.json()


def test_exports_and_saved_views() -> None:
    h = login()
    xlsx = client.get("/api/v1/requests/export.xlsx", headers=h)
    assert xlsx.status_code == 200
    assert "spreadsheetml" in xlsx.headers.get("content-type", "")

    view = client.post(
        "/api/v1/saved-views",
        headers=h,
        json={"name": "Test view", "report_type": "mis", "filters": {"status": "in_progress"}},
    )
    assert view.status_code == 201, view.text
    listed = client.get("/api/v1/saved-views?report_type=mis", headers=h)
    assert len(listed.json()) >= 1


if __name__ == "__main__":
    test_master_data_and_drafts()
    test_wizard_and_compliance()
    test_exports_and_saved_views()
    print("test_web_phases_api OK")
