"""Named users and assignment modes (claim, load_balance, round_robin)."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _login(email: str) -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "changeme"})
    if r.status_code != 200:
        pytest.skip(f"User {email} not seeded")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_users_claim_assignment() -> None:
    admin_h = _login("admin@demo.wizflow.biz")
    acc1_h = _login("acc1@demo.wizflow.biz")
    acc2_h = _login("acc2@demo.wizflow.biz")
    orig_h = _login("originator@demo.wizflow.biz")

    wf_list = client.get("/api/v1/workflows", headers=orig_h)
    assert wf_list.status_code == 200
    fee = next((w for w in wf_list.json() if w["name"] == "Fee Note Approval"), None)
    if not fee:
        pytest.skip("Fee Note Approval workflow not seeded")

    submit = client.post(
        f"/api/v1/workflows/{fee['id']}/submit",
        headers=orig_h,
        json={"data": {"client_name": "Acme", "amount": 1000, "notes": "Test"}},
    )
    assert submit.status_code == 201, submit.text
    req_id = submit.json()["id"]

    approve_admin = client.post(
        f"/api/v1/requests/{req_id}/approve",
        headers=admin_h,
        json={"comment": "ok"},
    )
    assert approve_admin.status_code == 200

    inbox1 = client.get("/api/v1/inbox", headers=acc1_h)
    inbox2 = client.get("/api/v1/inbox", headers=acc2_h)
    assert any(i["request_id"] == req_id for i in inbox1.json())
    assert any(i["request_id"] == req_id for i in inbox2.json())

    claim = client.post(f"/api/v1/requests/{req_id}/claim", headers=acc1_h)
    assert claim.status_code == 200
    assert len(claim.json()["assignees"]) == 1

    inbox2_after = client.get("/api/v1/inbox", headers=acc2_h)
    assert not any(i["request_id"] == req_id for i in inbox2_after.json())

    reject_other = client.post(f"/api/v1/requests/{req_id}/reject", headers=acc2_h, json={})
    assert reject_other.status_code == 400

    final = client.post(f"/api/v1/requests/{req_id}/approve", headers=acc1_h, json={})
    assert final.status_code == 200
    assert final.json()["status"] == "approved"


def test_notification_unread_count() -> None:
    admin_h = _login("admin@demo.wizflow.biz")
    r = client.get("/api/v1/notifications/unread-count", headers=admin_h)
    assert r.status_code == 200
    data = r.json()
    assert "unread" in data and "inbox" in data


def test_public_approval_token() -> None:
    from sqlalchemy import select

    from app.db.models import User, WorkflowInstance
    from app.db.session import SessionLocal
    from app.services.approval_tokens import create_approval_token

    admin_h = _login("admin@demo.wizflow.biz")
    orig_h = _login("originator@demo.wizflow.biz")

    wf_list = client.get("/api/v1/workflows?status=published", headers=orig_h)
    petty = next((w for w in wf_list.json() if "Petty" in w["name"]), wf_list.json()[0])

    submit = client.post(
        f"/api/v1/workflows/{petty['id']}/submit",
        headers=orig_h,
        json={"data": {"amount": 100, "purpose": "token test", "department": "IT"}},
    )
    assert submit.status_code == 201
    req_id = submit.json()["id"]

    db = SessionLocal()
    try:
        inst = db.scalar(select(WorkflowInstance).where(WorkflowInstance.id == req_id))
        admin = db.scalar(select(User).where(User.email == "admin@demo.wizflow.biz"))
        assert inst and admin
        raw = create_approval_token(
            db,
            company_id=inst.company_id,
            instance=inst,
            user_id=admin.id,
            step_id=inst.current_step_id or "",
        )
        db.commit()
    finally:
        db.close()

    view = client.get(f"/api/v1/public/approval/{raw}")
    assert view.status_code == 200
    assert view.json()["workflow_name"]

    decide = client.post(
        f"/api/v1/public/approval/{raw}/decide",
        json={"action": "approve", "comment": "via email"},
    )
    assert decide.status_code == 200

    again = client.get(f"/api/v1/public/approval/{raw}")
    assert again.status_code == 404
