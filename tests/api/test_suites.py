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


def test_suite_crud_and_launcher(auth_headers) -> None:
    # Create
    r = client.post("/api/v1/suites", headers=auth_headers, json={"name": "QA Suite", "icon": "🧪"})
    assert r.status_code == 201, r.text
    suite = r.json()
    sid = suite["id"]
    assert suite["status"] == "draft"
    assert suite["item_count"] == 0

    try:
        # Appears in the list
        listing = client.get("/api/v1/suites", headers=auth_headers).json()
        assert any(s["id"] == sid for s in listing)

        # Add members from available processes (if any are seeded)
        available = client.get("/api/v1/suites/available-processes", headers=auth_headers).json()
        assert isinstance(available, list)
        if available:
            fam = available[0]["family_id"]
            upd = client.put(
                f"/api/v1/suites/{sid}/items", headers=auth_headers, json={"family_ids": [fam]}
            )
            assert upd.status_code == 200, upd.text
            assert upd.json()["item_count"] == 1
            # Unknown / cross-tenant families are silently dropped
            upd2 = client.put(
                f"/api/v1/suites/{sid}/items",
                headers=auth_headers,
                json={"family_ids": [fam, "00000000-0000-0000-0000-000000000000"]},
            )
            assert upd2.json()["item_count"] == 1

        # Publish
        pub = client.patch(f"/api/v1/suites/{sid}", headers=auth_headers, json={"status": "published"})
        assert pub.status_code == 200
        assert pub.json()["status"] == "published"

        # Launcher shape
        launcher = client.get("/api/v1/suites/launcher", headers=auth_headers)
        assert launcher.status_code == 200
        body = launcher.json()
        assert "suites" in body and "ungrouped" in body
        assert isinstance(body["suites"], list) and isinstance(body["ungrouped"], list)
    finally:
        d = client.delete(f"/api/v1/suites/{sid}", headers=auth_headers)
        assert d.status_code == 204


def test_suite_templates(auth_headers) -> None:
    tpls = client.get("/api/v1/suites/templates", headers=auth_headers).json()
    assert any(t["id"] == "expense_management" for t in tpls)
    expense = next(t for t in tpls if t["id"] == "expense_management")
    assert expense["process_count"] == 4  # petty cash, imprest, transport, travel

    created = client.post(
        "/api/v1/suites/templates/expense_management/clone", headers=auth_headers
    )
    assert created.status_code == 201, created.text
    res = created.json()
    assert res["created_workflows"] == 4
    sid = res["suite_id"]
    try:
        detail = client.get(f"/api/v1/suites/{sid}", headers=auth_headers).json()
        assert detail["item_count"] == 4
        # cloned members start as drafts (not yet live to end users)
        assert all(it["status"] in ("draft", "published") for it in detail["items"])
    finally:
        client.delete(f"/api/v1/suites/{sid}", headers=auth_headers)


def test_unknown_suite_template_404(auth_headers) -> None:
    r = client.post("/api/v1/suites/templates/does_not_exist/clone", headers=auth_headers)
    assert r.status_code == 404
