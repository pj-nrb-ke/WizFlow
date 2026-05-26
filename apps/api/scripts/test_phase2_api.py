"""Phase 2 Sprint 1 analytics API tests (TestClient). Run: python -m scripts.test_phase2_api"""

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


def test_analytics_executive() -> None:
    h = login()
    r = client.get("/api/v1/analytics/executive", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    for key in (
        "total_requests",
        "in_progress",
        "approved",
        "rejected",
        "returned",
        "overdue_count",
        "rejection_rate",
        "sla_compliance_pct",
    ):
        assert key in data, key


def test_analytics_workflows() -> None:
    h = login()
    r = client.get("/api/v1/analytics/workflows", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "workflows" in body
    if body["workflows"]:
        row = body["workflows"][0]
        assert "workflow_name" in row and "total" in row and "rejection_rate" in row


def test_analytics_forbidden_for_originator() -> None:
    h = login("originator@demo.wizflow.biz")
    r = client.get("/api/v1/analytics/executive", headers=h)
    assert r.status_code == 403, r.text


def main() -> None:
    test_analytics_executive()
    test_analytics_workflows()
    test_analytics_forbidden_for_originator()
    print("All Phase 2 analytics API tests passed.")


if __name__ == "__main__":
    main()
