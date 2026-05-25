"""Request reference numbers and MIS action export."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _headers(email: str) -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "changeme"})
    if r.status_code != 200:
        pytest.skip(f"User {email} not seeded")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_submit_assigns_reference_number() -> None:
    orig = _headers("originator@demo.wizflow.biz")
    wfs = client.get("/api/v1/workflows?status=published", headers=orig).json()
    petty = next((w for w in wfs if "Petty" in w["name"]), None)
    if not petty:
        pytest.skip("No petty cash workflow")
    sub = client.post(
        f"/api/v1/workflows/{petty['id']}/submit",
        headers=orig,
        json={"data": {"amount": 99, "purpose": "Serial test", "department": "IT"}},
    )
    assert sub.status_code == 201
    ref = sub.json().get("reference_number")
    assert ref
    assert ref.startswith("PC-")
    assert "-" in ref[3:]


def test_inbox_includes_reference() -> None:
    admin = _headers("admin@demo.wizflow.biz")
    inbox = client.get("/api/v1/inbox", headers=admin)
    assert inbox.status_code == 200
    if inbox.json():
        assert "reference_number" in inbox.json()[0]


def test_mis_actions_csv() -> None:
    admin = _headers("admin@demo.wizflow.biz")
    r = client.get("/api/v1/reports/mis/actions.csv", headers=admin)
    assert r.status_code == 200
    assert "reference_number" in r.text
    assert "action_at" in r.text
