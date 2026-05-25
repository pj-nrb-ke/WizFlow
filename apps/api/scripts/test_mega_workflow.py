"""Test 8-step capital expenditure workflow end-to-end."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.main import app
from scripts.seed_custom_workflow_demo import MEGA_WORKFLOW_NAME

client = TestClient(app)
PASS = "changeme"


def login(email: str) -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": PASS})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def run() -> None:
    wf_id = next(
        w["id"]
        for w in client.get(
            "/api/v1/workflows", params={"status": "published"}, headers=login("admin@demo.wizflow.biz")
        ).json()
        if w["name"] == MEGA_WORKFLOW_NAME
    )
    detail = client.get(f"/api/v1/workflows/{wf_id}", headers=login("admin@demo.wizflow.biz"))
    assert detail.status_code == 200
    steps = detail.json()["steps"]
    assert len(steps) == 8, f"Expected 8 steps, got {len(steps)}"

    r = client.post(
        f"/api/v1/workflows/{wf_id}/submit",
        json={
            "data": {
                "project_name": "HQ Renovation",
                "amount": 120000,
                "business_case": "Facility upgrade",
                "department": "ops",
            }
        },
        headers=login("originator@demo.wizflow.biz"),
    )
    assert r.status_code == 201, r.text
    req_id = r.json()["id"]
    assert r.json()["step_sequence"] == [s["id"] for s in steps]

    approvers = [f"approver{i}@demo.wizflow.biz" for i in range(1, 9)]
    for i, email in enumerate(approvers[:7]):
        r = client.get(f"/api/v1/requests/{req_id}", headers=login(email))
        if r.status_code == 200 and r.json().get("can_approve"):
            client.post(
                f"/api/v1/requests/{req_id}/approve",
                json={"comment": f"Step {i + 1} OK"},
                headers=login(email),
            )
            break
    else:
        raise AssertionError("No approver could act on step 1")

    r = client.get(f"/api/v1/requests/{req_id}", headers=login("originator@demo.wizflow.biz"))
    assert r.status_code == 200
    assert r.json()["status"] in ("in_progress", "approved")

    inbox = client.get("/api/v1/inbox", headers=login("admin@demo.wizflow.biz"))
    assert len(inbox.json()) >= 15, f"Admin inbox expected 15+, got {len(inbox.json())}"

    my_req = client.get("/api/v1/requests", headers=login("originator@demo.wizflow.biz"))
    assert len(my_req.json()) >= 15, f"Originator requests expected 15+, got {len(my_req.json())}"

    print(f"8-step workflow OK ({len(steps)} steps). Inbox={len(inbox.json())} MyRequests={len(my_req.json())}")


if __name__ == "__main__":
    run()
