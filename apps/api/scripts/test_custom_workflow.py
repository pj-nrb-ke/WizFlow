"""Smoke-test custom workflow: initiator filter, submit, approve, reject path."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.main import app
from scripts.seed_custom_workflow_demo import CUSTOM_WORKFLOW_NAME, seed_custom_workflow_demo

client = TestClient(app)

PASS = "changeme"
ORIGINATOR = "originator@demo.wizflow.biz"
APPROVER1 = "approver1@demo.wizflow.biz"
NON_INITIATOR = "approver2@demo.wizflow.biz"
ADMIN = "admin@demo.wizflow.biz"


def login(email: str) -> str:
    r = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASS},
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def auth(email: str) -> dict:
    return {"Authorization": f"Bearer {login(email)}"}


def run(*, skip_seed: bool = False) -> None:
    if not skip_seed:
        seed_custom_workflow_demo()

    # Name check
    r = client.get(
        "/api/v1/workflows/check-name",
        params={"name": CUSTOM_WORKFLOW_NAME},
        headers=auth(ADMIN),
    )
    assert r.status_code == 200
    assert r.json()["available"] is False

    # Initiator sees workflow on submit list
    r = client.get(
        "/api/v1/workflows",
        params={"status": "published", "initiator_only": True},
        headers=auth(ORIGINATOR),
    )
    assert r.status_code == 200
    names = [w["name"] for w in r.json()]
    assert CUSTOM_WORKFLOW_NAME in names

    # Non-initiator (only approver2, not in initiator set) may not see custom workflow
    r = client.get(
        "/api/v1/workflows",
        params={"status": "published", "initiator_only": True},
        headers=auth(NON_INITIATOR),
    )
    assert CUSTOM_WORKFLOW_NAME not in [w["name"] for w in r.json()]

    wf_id = next(w["id"] for w in client.get(
        "/api/v1/workflows", params={"status": "published"}, headers=auth(ADMIN)
    ).json() if w["name"] == CUSTOM_WORKFLOW_NAME)

    # Submit as originator
    r = client.post(
        f"/api/v1/workflows/{wf_id}/submit",
        json={"data": {"amount": 250, "purpose": "Team lunch", "department": "it"}},
        headers=auth(ORIGINATOR),
    )
    assert r.status_code == 201, r.text
    req_id = r.json()["id"]
    assert r.json()["status"] == "in_progress"

    # Originator cannot approve own request
    r = client.get(f"/api/v1/requests/{req_id}", headers=auth(ORIGINATOR))
    assert r.status_code == 200
    assert r.json()["is_originator"] is True
    assert r.json()["can_approve"] is False

    # First approver can act
    r = client.get(f"/api/v1/requests/{req_id}", headers=auth(APPROVER1))
    assert r.status_code == 200
    assert r.json()["can_approve"] is True
    assert r.json()["is_originator"] is False

    r = client.post(
        f"/api/v1/requests/{req_id}/approve",
        json={"comment": "Looks good"},
        headers=auth(APPROVER1),
    )
    assert r.status_code == 200, r.text

    # Second step: approver2 in finance group inbox
    r = client.get("/api/v1/inbox", headers=auth(NON_INITIATOR))
    assert r.status_code == 200
    inbox_ids = [i["request_id"] for i in r.json()]
    assert req_id in inbox_ids

    r = client.post(
        f"/api/v1/requests/{req_id}/reject",
        json={"comment": "Budget frozen"},
        headers=auth(NON_INITIATOR),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "rejected"

    # Originator dashboard list includes rejected request
    r = client.get("/api/v1/requests", headers=auth(ORIGINATOR))
    assert any(x["id"] == req_id and x["status"] == "rejected" for x in r.json())

    # Org directory
    r = client.get("/api/v1/workflows/org-directory", headers=auth(ADMIN))
    assert r.status_code == 200
    assert len(r.json()["users"]) >= 4
    assert len(r.json()["groups"]) >= 2

    print("All custom workflow tests passed.")


if __name__ == "__main__":
    run()  # expects DB already seeded
