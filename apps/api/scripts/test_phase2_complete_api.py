"""Phase 2 Sprint 2 API tests."""

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


def test_phase2_analytics_extensions() -> None:
    h = login()
    for path in (
        "/api/v1/analytics/workload",
        "/api/v1/analytics/workload/history",
        "/api/v1/analytics/journey",
        "/api/v1/analytics/heatmap",
        "/api/v1/analytics/scorecards",
    ):
        r = client.get(path, headers=h)
        assert r.status_code == 200, f"{path}: {r.text}"


def test_kpi_targets_and_subscriptions() -> None:
    h = login()
    r = client.post(
        "/api/v1/kpi-targets",
        headers=h,
        json={"metric_key": "sla_compliance_pct", "label": "SLA %", "target_value": 90},
    )
    assert r.status_code in (201, 409), r.text
    listed = client.get("/api/v1/kpi-targets", headers=h)
    assert listed.status_code == 200
    sub = client.post(
        "/api/v1/report-subscriptions",
        headers=h,
        json={"name": "Test weekly", "frequency": "weekly", "report_type": "executive_summary"},
    )
    assert sub.status_code == 201, sub.text


def test_automation_run() -> None:
    h = login()
    r = client.post("/api/v1/automation/run", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "sla_warnings" in body and "escalations" in body


def main() -> None:
    test_phase2_analytics_extensions()
    test_kpi_targets_and_subscriptions()
    test_automation_run()
    print("All Phase 2 complete API tests passed.")


if __name__ == "__main__":
    main()
