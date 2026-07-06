"""Tests for the Recurring Activities engine: recurrence math, API CRUD,
compliance, nagging, escalation, and close-on-submit."""

from __future__ import annotations

import uuid as _uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.models import (
    ActivityCycle,
    ActivityObligation,
    RecurringActivity,
    User,
    WorkflowDefinition,
    WorkflowInstance,
)
from app.db.session import SessionLocal
from app.services import recurring_activities as ra

client = TestClient(app)


# ── Part A: recurrence math (no DB) ──────────────────────────────────────────


def _act(**kw):
    base = dict(
        freq="monthly", interval=1, by_weekday=None, by_monthday=None, by_month=None,
        start_date=date(2026, 1, 1), end_date=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_monthly_fires_on_chosen_day():
    a = _act(freq="monthly", by_monthday=15)
    assert ra.activity_due_on(a, date(2026, 7, 15)) is True
    assert ra.activity_due_on(a, date(2026, 7, 14)) is False
    assert ra.activity_due_on(a, date(2026, 8, 15)) is True


def test_monthly_clamps_to_last_day_in_short_months():
    a = _act(freq="monthly", by_monthday=31)
    assert ra.activity_due_on(a, date(2026, 2, 28)) is True  # Feb has no 31st
    assert ra.activity_due_on(a, date(2026, 2, 27)) is False
    assert ra.activity_due_on(a, date(2026, 4, 30)) is True  # Apr has no 31st
    assert ra._clamp_monthday(31, 2026, 2) == 28
    assert ra._clamp_monthday(29, 2024, 2) == 29  # leap year


def test_quarterly_interval_anchored_to_start():
    # interval=3 monthly, started in January -> Jan/Apr/Jul/Oct
    q = _act(freq="monthly", interval=3, by_monthday=1, start_date=date(2026, 1, 1))
    assert ra.activity_due_on(q, date(2026, 4, 1)) is True
    assert ra.activity_due_on(q, date(2026, 5, 1)) is False
    assert ra.activity_due_on(q, date(2026, 7, 1)) is True


def test_yearly_fires_on_month_and_day():
    y = _act(freq="yearly", by_month=4, by_monthday=15, start_date=date(2026, 1, 1))
    assert ra.activity_due_on(y, date(2027, 4, 15)) is True
    assert ra.activity_due_on(y, date(2027, 4, 16)) is False
    assert ra.activity_due_on(y, date(2027, 5, 15)) is False


def test_weekly_fortnightly_from_start():
    # Fortnightly Fridays, anchored Mon 2026-07-06
    w = _act(freq="weekly", by_weekday=4, interval=2, start_date=date(2026, 7, 6))
    assert ra.activity_due_on(w, date(2026, 7, 10)) is True   # first Friday
    assert ra.activity_due_on(w, date(2026, 7, 17)) is False  # +1 week
    assert ra.activity_due_on(w, date(2026, 7, 24)) is True   # +2 weeks


def test_respects_start_and_end_date():
    a = _act(freq="monthly", by_monthday=15, start_date=date(2026, 7, 1), end_date=date(2026, 9, 30))
    assert ra.activity_due_on(a, date(2026, 6, 15)) is False  # before start
    assert ra.activity_due_on(a, date(2026, 8, 15)) is True
    assert ra.activity_due_on(a, date(2026, 10, 15)) is False  # after end


# ── Shared auth / helpers for DB + API tests ─────────────────────────────────


def _login(email: str = "admin@demo.wizflow.biz") -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "changeme"})
    if r.status_code != 200:
        pytest.skip(f"User {email} not seeded — run seed.py first")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin_headers():
    return _login()


@pytest.fixture(scope="module")
def me_id(admin_headers):
    return client.get("/api/v1/auth/me", headers=admin_headers).json()["id"]


def _today_dom() -> int:
    return datetime.now(timezone.utc).date().day


# ── Part B: API CRUD + compliance ────────────────────────────────────────────


def test_create_acknowledge_activity(admin_headers, me_id):
    r = client.post(
        "/api/v1/recurring-activities",
        headers=admin_headers,
        json={
            "name": "TEST ack activity",
            "freq": "monthly",
            "by_monthday": 15,
            "at_hour": 9,
            "start_date": str(date.today()),
            "completion_mode": "acknowledge",
            "recipient_user_ids": [me_id],
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["completion_mode"] == "acknowledge"
    assert body["schedule_summary"].startswith("Every month on the 15th")
    client.delete(f"/api/v1/recurring-activities/{body['id']}", headers=admin_headers)


def test_submit_workflow_mode_requires_workflow(admin_headers, me_id):
    r = client.post(
        "/api/v1/recurring-activities",
        headers=admin_headers,
        json={
            "name": "TEST bad submit",
            "freq": "monthly",
            "by_monthday": 1,
            "start_date": str(date.today()),
            "completion_mode": "submit_workflow",
            "recipient_user_ids": [me_id],
        },
    )
    assert r.status_code == 400


def test_invalid_frequency_rejected(admin_headers, me_id):
    r = client.post(
        "/api/v1/recurring-activities",
        headers=admin_headers,
        json={"name": "TEST", "freq": "hourly", "start_date": str(date.today()), "recipient_user_ids": [me_id]},
    )
    assert r.status_code == 400


def test_weekly_needs_weekday(admin_headers, me_id):
    r = client.post(
        "/api/v1/recurring-activities",
        headers=admin_headers,
        json={"name": "TEST", "freq": "weekly", "start_date": str(date.today()), "recipient_user_ids": [me_id]},
    )
    assert r.status_code == 400


def test_run_now_opens_cycle_and_acknowledge_flow(admin_headers, me_id):
    # Create an acknowledge activity due today with me as the only recipient.
    cr = client.post(
        "/api/v1/recurring-activities",
        headers=admin_headers,
        json={
            "name": "TEST run-now flow",
            "freq": "monthly",
            "by_monthday": _today_dom(),
            "at_hour": 0,
            "start_date": str(date.today()),
            "completion_mode": "acknowledge",
            "recipient_user_ids": [me_id],
        },
    )
    assert cr.status_code == 201, cr.text
    act_id = cr.json()["id"]
    try:
        # run-now opens today's cycle and returns compliance
        rn = client.post(f"/api/v1/recurring-activities/{act_id}/run-now", headers=admin_headers)
        assert rn.status_code == 200, rn.text
        summary = rn.json()
        assert summary["total"] >= 1
        assert summary["outstanding"] >= 1

        # my obligations should include this one, outstanding
        mine = client.get("/api/v1/recurring-activities/mine/obligations", headers=admin_headers).json()
        obl = next((o for o in mine if o["activity_id"] == act_id), None)
        assert obl is not None
        assert obl["status"] == "outstanding"

        # acknowledge it
        ack = client.post(
            f"/api/v1/recurring-activities/obligations/{obl['id']}/acknowledge", headers=admin_headers
        )
        assert ack.status_code == 200
        assert ack.json()["status"] == "submitted"

        # compliance now shows 1 submitted
        comp = client.get(f"/api/v1/recurring-activities/{act_id}/compliance", headers=admin_headers).json()
        assert comp["submitted"] >= 1
        assert comp["compliance_pct"] > 0
    finally:
        client.delete(f"/api/v1/recurring-activities/{act_id}", headers=admin_headers)


def test_run_now_idempotent(admin_headers, me_id):
    cr = client.post(
        "/api/v1/recurring-activities",
        headers=admin_headers,
        json={
            "name": "TEST idempotent",
            "freq": "monthly",
            "by_monthday": _today_dom(),
            "at_hour": 0,
            "start_date": str(date.today()),
            "completion_mode": "acknowledge",
            "recipient_user_ids": [me_id],
        },
    )
    act_id = cr.json()["id"]
    try:
        client.post(f"/api/v1/recurring-activities/{act_id}/run-now", headers=admin_headers)
        client.post(f"/api/v1/recurring-activities/{act_id}/run-now", headers=admin_headers)
        comp = client.get(f"/api/v1/recurring-activities/{act_id}/compliance", headers=admin_headers).json()
        # Only one cycle should exist despite two run-now calls
        assert len(comp["cycles"]) == 1
        assert comp["total"] == 1
    finally:
        client.delete(f"/api/v1/recurring-activities/{act_id}", headers=admin_headers)


def test_toggle_active_and_delete(admin_headers, me_id):
    cr = client.post(
        "/api/v1/recurring-activities",
        headers=admin_headers,
        json={
            "name": "TEST toggle", "freq": "monthly", "by_monthday": 1,
            "start_date": str(date.today()), "completion_mode": "acknowledge",
            "recipient_user_ids": [me_id],
        },
    )
    act_id = cr.json()["id"]
    assert cr.json()["is_active"] is True
    r = client.patch(
        f"/api/v1/recurring-activities/{act_id}", headers=admin_headers, json={"is_active": False}
    )
    assert r.status_code == 200 and r.json()["is_active"] is False
    d = client.delete(f"/api/v1/recurring-activities/{act_id}", headers=admin_headers)
    assert d.status_code == 204
    assert client.get(f"/api/v1/recurring-activities/{act_id}", headers=admin_headers).status_code == 404


def test_endpoints_require_auth():
    fresh = TestClient(app)
    assert fresh.get("/api/v1/recurring-activities").status_code in (401, 403)
    assert fresh.get("/api/v1/recurring-activities/mine/obligations").status_code in (401, 403)


# ── Part C: nag / escalation / close-on-submit (service level) ───────────────


@pytest.fixture()
def db():
    s = SessionLocal()
    yield s
    s.close()


@pytest.fixture()
def company_and_users(db):
    admin = db.scalar(
        __import__("sqlalchemy").select(User).where(User.email == "admin@demo.wizflow.biz")
    )
    if not admin:
        pytest.skip("demo admin not seeded")
    from sqlalchemy import select
    others = list(
        db.scalars(
            select(User).where(User.company_id == admin.company_id, User.id != admin.id).limit(2)
        )
    )
    if len(others) < 1:
        pytest.skip("need at least one non-admin user")
    return admin, others


def _mk_activity(db, company_id, **over):
    a = RecurringActivity(
        company_id=company_id,
        name="TEST-" + _uuid.uuid4().hex[:8],
        freq="monthly", interval=1, by_monthday=1, at_hour=0, timezone="UTC",
        start_date=date.today(), completion_mode="acknowledge",
        recipient_user_ids=[], remind_enabled=True, remind_interval_days=1, remind_max_count=10,
    )
    for k, v in over.items():
        setattr(a, k, v)
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def test_nagging_increments_and_escalates(db, company_and_users, monkeypatch):
    admin, others = company_and_users
    recipient = others[0]
    calls = []
    monkeypatch.setattr(ra, "notify_users", lambda *a, **k: calls.append(k))

    act = _mk_activity(
        db, admin.company_id,
        escalate_after_count=1, supervisor_user_id=admin.id, remind_interval_days=1, remind_max_count=10,
    )
    try:
        # Cycle due yesterday -> one nag is due today.
        cyc = ActivityCycle(company_id=admin.company_id, activity_id=act.id,
                            due_date=date.today() - timedelta(days=1), period_label="test")
        db.add(cyc)
        db.flush()
        ob = ActivityObligation(company_id=admin.company_id, activity_id=act.id,
                                cycle_id=cyc.id, user_id=recipient.id, status="outstanding")
        db.add(ob)
        db.commit()

        sent = ra.process_activity_reminders(db, company_id=admin.company_id)
        db.refresh(ob)
        assert sent >= 1
        assert ob.reminder_count == 1
        # escalate_after_count=1 -> supervisor escalated on this first nag
        assert ob.escalated_at is not None
        # a nag to the recipient AND an escalation to the supervisor were sent
        assert any(recipient.id in (k.get("user_ids") or []) for k in calls)
        assert any(admin.id in (k.get("user_ids") or []) for k in calls)

        # Running again the same day must NOT double-nag (one per day).
        before = ob.reminder_count
        ra.process_activity_reminders(db, company_id=admin.company_id)
        db.refresh(ob)
        assert ob.reminder_count == before
    finally:
        db.delete(act)
        db.commit()


def test_max_count_stops_nagging(db, company_and_users, monkeypatch):
    admin, others = company_and_users
    recipient = others[0]
    monkeypatch.setattr(ra, "notify_users", lambda *a, **k: None)

    act = _mk_activity(db, admin.company_id, remind_max_count=1)
    try:
        cyc = ActivityCycle(company_id=admin.company_id, activity_id=act.id,
                            due_date=date.today() - timedelta(days=3), period_label="test")
        db.add(cyc)
        db.flush()
        # Already reminded once, at the cap.
        ob = ActivityObligation(company_id=admin.company_id, activity_id=act.id, cycle_id=cyc.id,
                                user_id=recipient.id, status="outstanding", reminder_count=1,
                                last_reminded_at=datetime.now(timezone.utc) - timedelta(days=1))
        db.add(ob)
        db.commit()

        ra.process_activity_reminders(db, company_id=admin.company_id)
        db.refresh(ob)
        assert ob.reminder_count == 1  # unchanged: cap reached
    finally:
        db.delete(act)
        db.commit()


def test_submitted_obligation_not_nagged(db, company_and_users, monkeypatch):
    admin, others = company_and_users
    recipient = others[0]
    monkeypatch.setattr(ra, "notify_users", lambda *a, **k: None)

    act = _mk_activity(db, admin.company_id)
    try:
        cyc = ActivityCycle(company_id=admin.company_id, activity_id=act.id,
                            due_date=date.today() - timedelta(days=2), period_label="test")
        db.add(cyc)
        db.flush()
        ob = ActivityObligation(company_id=admin.company_id, activity_id=act.id, cycle_id=cyc.id,
                                user_id=recipient.id, status="submitted")
        db.add(ob)
        db.commit()

        sent = ra.process_activity_reminders(db, company_id=admin.company_id)
        db.refresh(ob)
        assert ob.reminder_count == 0
        assert sent == 0
    finally:
        db.delete(act)
        db.commit()


def test_close_obligation_on_submit(db, company_and_users):
    admin, others = company_and_users
    recipient = others[0]
    from sqlalchemy import select
    defn = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.company_id == admin.company_id,
            WorkflowDefinition.status == "published",
        )
    )
    if not defn:
        pytest.skip("no published workflow to link")

    act = _mk_activity(
        db, admin.company_id, completion_mode="submit_workflow", workflow_definition_id=defn.id,
    )
    try:
        cyc = ActivityCycle(company_id=admin.company_id, activity_id=act.id,
                            due_date=date.today(), period_label="test")
        db.add(cyc)
        db.flush()
        ob = ActivityObligation(company_id=admin.company_id, activity_id=act.id, cycle_id=cyc.id,
                                user_id=recipient.id, status="outstanding")
        db.add(ob)
        db.commit()

        # Simulate this recipient submitting the linked workflow.
        inst = WorkflowInstance(
            company_id=admin.company_id, workflow_definition_id=defn.id,
            originator_user_id=recipient.id, status="in_progress", workflow_name=defn.name,
        )
        db.add(inst)
        db.flush()

        closed = ra.close_obligations_for_instance(db, inst)
        db.commit()
        db.refresh(ob)
        assert closed == 1
        assert ob.status == "submitted"
        assert ob.instance_id == inst.id
        assert ob.completed_at is not None
    finally:
        db.delete(act)
        db.commit()
