"""Tests for the Recurring Schedules module.

A RecurringSchedule is the reusable "WHEN" (calendar recurrence); each
ScheduleTarget is a "WHAT" (a workflow to submit, an acknowledge task, or a
checklist to reopen). Coverage:

* recurrence math ``schedule_due_on`` (no DB) — day-of-month + clamp, weekly
  weekday/interval anchoring, yearly month+day + clamp, interval anchoring,
  start/end cutoffs;
* schedule CRUD + recurrence validation via the API;
* target attach for workflow / checklist / acknowledge kinds (+ cross-company);
* firing ``process_recurring_schedules`` — obligation targets open a run +
  one obligation per recipient; checklist targets spawn the next
  ChecklistInstance (no obligations); idempotent per day;
* ``process_schedule_reminders`` — nag cadence, remind_max_count /
  remind_window_days, escalate-to-supervisor once;
* ``close_obligations_for_instance`` and ``acknowledge_obligation``;
* tenant isolation + auth.

The suite is self-contained: it builds its own companies/users/workflow/
checklist so it runs green against a freshly-migrated disposable database. Run
against a throwaway DB, never the live demo (see the module docstring in the
PR / task notes for the exact command).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from app.core.security import create_access_token
from app.db import models as m
from app.db.session import SessionLocal
from app.main import app
from app.services import recurring_schedules as rs
from app.services.checklists import gen_token

client = TestClient(app)
TODAY = date.today().isoformat()


# ── Part A: recurrence math (pure, no DB) ────────────────────────────────────


def _sched(**kw) -> SimpleNamespace:
    base = dict(
        freq="monthly", interval=1, by_weekday=None, by_monthday=None, by_month=None,
        start_date=date(2026, 1, 1), end_date=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_monthly_fires_on_chosen_day():
    a = _sched(freq="monthly", by_monthday=15)
    assert rs.schedule_due_on(a, date(2026, 7, 15)) is True
    assert rs.schedule_due_on(a, date(2026, 7, 14)) is False
    assert rs.schedule_due_on(a, date(2026, 8, 15)) is True


def test_monthly_clamps_to_last_day_in_short_months():
    a = _sched(freq="monthly", by_monthday=31)
    assert rs.schedule_due_on(a, date(2026, 2, 28)) is True   # Feb has no 31st
    assert rs.schedule_due_on(a, date(2026, 2, 27)) is False
    assert rs.schedule_due_on(a, date(2026, 4, 30)) is True   # Apr has no 31st
    assert rs.schedule_due_on(a, date(2026, 4, 29)) is False
    assert rs._clamp_monthday(31, 2026, 2) == 28
    assert rs._clamp_monthday(29, 2024, 2) == 29  # leap year


def test_weekly_by_weekday_and_fortnightly_anchor():
    # Fortnightly Fridays anchored to Mon 2026-07-06.
    w = _sched(freq="weekly", by_weekday=4, interval=2, start_date=date(2026, 7, 6))
    assert rs.schedule_due_on(w, date(2026, 7, 10)) is True   # first Friday
    assert rs.schedule_due_on(w, date(2026, 7, 17)) is False  # +1 week
    assert rs.schedule_due_on(w, date(2026, 7, 24)) is True   # +2 weeks
    assert rs.schedule_due_on(w, date(2026, 7, 9)) is False   # wrong weekday (Thu)


def test_weekly_every_week():
    w = _sched(freq="weekly", by_weekday=0, interval=1, start_date=date(2026, 7, 6))
    assert rs.schedule_due_on(w, date(2026, 7, 6)) is True    # Monday
    assert rs.schedule_due_on(w, date(2026, 7, 13)) is True   # next Monday
    assert rs.schedule_due_on(w, date(2026, 7, 7)) is False   # Tuesday


def test_monthly_interval_quarterly_anchored_to_start():
    # interval=3 monthly started in January -> Jan/Apr/Jul/Oct.
    q = _sched(freq="monthly", interval=3, by_monthday=1, start_date=date(2026, 1, 1))
    assert rs.schedule_due_on(q, date(2026, 1, 1)) is True
    assert rs.schedule_due_on(q, date(2026, 2, 1)) is False
    assert rs.schedule_due_on(q, date(2026, 4, 1)) is True
    assert rs.schedule_due_on(q, date(2026, 5, 1)) is False
    assert rs.schedule_due_on(q, date(2026, 7, 1)) is True


def test_yearly_fires_on_month_and_day():
    y = _sched(freq="yearly", by_month=4, by_monthday=15, start_date=date(2026, 1, 1))
    assert rs.schedule_due_on(y, date(2027, 4, 15)) is True
    assert rs.schedule_due_on(y, date(2027, 4, 16)) is False
    assert rs.schedule_due_on(y, date(2027, 5, 15)) is False


def test_yearly_interval_and_clamp():
    # Every 2 years on Feb 29, anchored 2024 (leap). Clamps to 28 on non-leap.
    y = _sched(freq="yearly", by_month=2, by_monthday=29, interval=2, start_date=date(2024, 1, 1))
    assert rs.schedule_due_on(y, date(2024, 2, 29)) is True   # leap, year diff 0
    assert rs.schedule_due_on(y, date(2026, 2, 28)) is True   # clamp, year diff 2
    assert rs.schedule_due_on(y, date(2025, 2, 28)) is False  # year diff 1 (odd)


def test_respects_start_and_end_date():
    a = _sched(freq="monthly", by_monthday=15, start_date=date(2026, 7, 1), end_date=date(2026, 9, 30))
    assert rs.schedule_due_on(a, date(2026, 6, 15)) is False   # before start
    assert rs.schedule_due_on(a, date(2026, 8, 15)) is True
    assert rs.schedule_due_on(a, date(2026, 10, 15)) is False  # after end


# ── Shared fixtures: disposable companies/users/workflow/checklist ───────────


@pytest.fixture()
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture(autouse=True)
def notify_spy(monkeypatch):
    """Capture (and neutralise) every notify_users call so tests never send
    real email/push and can assert on recipients."""
    calls: list[dict] = []

    def fake(_db, **kwargs):
        calls.append(kwargs)

    monkeypatch.setattr(rs, "notify_users", fake)
    return calls


def _headers(user_id, company_id, roles) -> dict:
    token = create_access_token(str(user_id), company_id, roles)
    return {"Authorization": f"Bearer {token}"}


def _make_company(db, *, with_workflow=True, with_checklist=True) -> SimpleNamespace:
    company = m.Company(name=f"T-{uuid4().hex[:8]}", slug=f"t-{uuid4().hex[:12]}")
    db.add(company)
    db.flush()

    roles = {}
    for slug in ("company_admin", "manager", "originator"):
        r = m.Role(company_id=company.id, slug=slug, name=slug)
        db.add(r)
        roles[slug] = r
    db.flush()

    def mkuser(name, role_slugs):
        u = m.User(
            company_id=company.id,
            email=f"u-{uuid4().hex}@t.example",
            password_hash="x",  # tokens are minted directly; login is never exercised
            full_name=name,
        )
        db.add(u)
        db.flush()
        for s in role_slugs:
            db.add(m.UserRole(user_id=u.id, role_id=roles[s].id))
        db.flush()
        return u

    admin = mkuser("Admin", ["company_admin", "manager"])
    r1 = mkuser("Recipient One", ["originator"])
    r2 = mkuser("Recipient Two", ["originator"])
    supervisor = mkuser("Supervisor", ["originator"])

    workflow_id = None
    if with_workflow:
        wf = m.WorkflowDefinition(
            company_id=company.id,
            name="T Workflow",
            family_id=uuid4(),
            version=1,
            status="published",
            form_schema={"fields": []},
            steps=[],
            routing_rules=[],
            settings={},
        )
        db.add(wf)
        db.flush()
        workflow_id = wf.id

    checklist_id = None
    base_instance_id = None
    base_task_titles: list[str] = []
    if with_checklist:
        today = date.today()
        cl = m.Checklist(
            company_id=company.id,
            name="T Checklist",
            start_date=today,
            due_date=today + timedelta(days=7),
            status="active",
        )
        db.add(cl)
        db.flush()
        base = m.ChecklistInstance(
            company_id=company.id,
            checklist_id=cl.id,
            period_start=today,
            period_end=today + timedelta(days=7),
            sequence=1,
            status="active",
        )
        db.add(base)
        db.flush()
        base_task_titles = ["Base Task A", "Base Task B"]
        for i, title in enumerate(base_task_titles):
            db.add(
                m.ChecklistTask(
                    company_id=company.id,
                    checklist_id=cl.id,
                    instance_id=base.id,
                    title=title,
                    order_index=i,
                    status="done",  # base tasks are already handled; clones reset to not_started
                    assignee_user_id=r1.id,
                    access_token=gen_token(),
                )
            )
        db.flush()
        checklist_id = cl.id
        base_instance_id = base.id

    # Capture plain-value ids before commit expires the ORM objects.
    ns = SimpleNamespace(
        company_id=company.id,
        admin_id=admin.id,
        recipient1_id=r1.id,
        recipient2_id=r2.id,
        supervisor_id=supervisor.id,
        workflow_id=workflow_id,
        checklist_id=checklist_id,
        base_instance_id=base_instance_id,
        base_task_titles=base_task_titles,
    )
    db.commit()
    ns.admin_headers = _headers(ns.admin_id, ns.company_id, ["company_admin", "manager"])
    ns.recipient1_headers = _headers(ns.recipient1_id, ns.company_id, ["originator"])
    ns.recipient2_headers = _headers(ns.recipient2_id, ns.company_id, ["originator"])
    return ns


def _cleanup(db, company_id) -> None:
    try:
        db.rollback()
        db.execute(text("DELETE FROM companies WHERE id = :cid"), {"cid": str(company_id)})
        db.commit()
    except Exception:
        db.rollback()


@pytest.fixture()
def env(db):
    e = _make_company(db, with_workflow=True, with_checklist=True)
    yield e
    _cleanup(db, e.company_id)


@pytest.fixture()
def other_env(db):
    e = _make_company(db, with_workflow=True, with_checklist=True)
    yield e
    _cleanup(db, e.company_id)


# ── DB helpers for service-level firing / reminder tests ─────────────────────


def _utc_today() -> date:
    """The 'today' the scheduler sees — it works in UTC, so tests must too."""
    return datetime.now(timezone.utc).date()


def _mk_schedule(db, company_id, **over):
    today = _utc_today()
    kw = dict(
        company_id=company_id, name=f"S-{uuid4().hex[:6]}", freq="monthly", interval=1,
        by_monthday=today.day, at_hour=0, timezone="UTC", start_date=today, is_active=True,
    )
    kw.update(over)
    s = m.RecurringSchedule(**kw)
    db.add(s)
    db.flush()
    return s


def _mk_target(db, company_id, schedule_id, kind, **over):
    kw = dict(
        company_id=company_id, schedule_id=schedule_id, kind=kind,
        recipient_user_ids=[], recipient_group_ids=[], remind_enabled=True,
        remind_interval_days=1, remind_max_count=10,
    )
    kw.update(over)
    t = m.ScheduleTarget(**kw)
    db.add(t)
    db.flush()
    return t


def _mk_run(db, sched, target, due_date):
    r = m.ScheduleRun(
        company_id=target.company_id, schedule_id=sched.id, target_id=target.id,
        due_date=due_date, period_label="test",
    )
    db.add(r)
    db.flush()
    return r


def _mk_ob(db, sched, target, run, user_id, **over):
    kw = dict(
        company_id=target.company_id, schedule_id=sched.id, target_id=target.id,
        run_id=run.id, user_id=user_id, status="outstanding",
    )
    kw.update(over)
    o = m.ScheduleObligation(**kw)
    db.add(o)
    db.flush()
    return o


# ── Part B: schedule CRUD + recurrence validation (API) ──────────────────────


def test_create_schedule_returns_summary_and_defaults(env):
    r = client.post(
        "/api/v1/recurring-schedules",
        headers=env.admin_headers,
        json={"name": "Monthly close", "freq": "monthly", "by_monthday": 15, "start_date": TODAY},
    )
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["freq"] == "monthly"
    assert b["interval"] == 1
    assert b["is_active"] is True
    assert b["schedule_summary"].startswith("Every month on the 15th")
    assert b["targets"] == []


def test_schedule_list_get_patch_delete(env):
    h = env.admin_headers
    sid = client.post(
        "/api/v1/recurring-schedules",
        headers=h,
        json={"name": "CRUD", "freq": "monthly", "by_monthday": 1, "start_date": TODAY},
    ).json()["id"]

    listed = client.get("/api/v1/recurring-schedules", headers=h).json()
    assert any(s["id"] == sid for s in listed)

    g = client.get(f"/api/v1/recurring-schedules/{sid}", headers=h)
    assert g.status_code == 200 and g.json()["id"] == sid

    p = client.patch(
        f"/api/v1/recurring-schedules/{sid}", headers=h, json={"name": "CRUD renamed", "is_active": False}
    )
    assert p.status_code == 200
    assert p.json()["name"] == "CRUD renamed"
    assert p.json()["is_active"] is False

    d = client.delete(f"/api/v1/recurring-schedules/{sid}", headers=h)
    assert d.status_code == 204
    assert client.get(f"/api/v1/recurring-schedules/{sid}", headers=h).status_code == 404


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "bad-freq", "freq": "hourly", "start_date": TODAY},
        {"name": "weekly-no-weekday", "freq": "weekly", "start_date": TODAY},
        {"name": "monthly-no-monthday", "freq": "monthly", "start_date": TODAY},
        {"name": "yearly-no-month", "freq": "yearly", "by_monthday": 15, "start_date": TODAY},
    ],
)
def test_recurrence_validation_errors(env, payload):
    r = client.post("/api/v1/recurring-schedules", headers=env.admin_headers, json=payload)
    assert r.status_code == 400, r.text


# ── Part C: target attach (workflow / checklist / acknowledge) ───────────────


def _new_schedule(headers) -> str:
    return client.post(
        "/api/v1/recurring-schedules",
        headers=headers,
        json={"name": "host", "freq": "monthly", "by_monthday": 1, "start_date": TODAY},
    ).json()["id"]


def test_workflow_target_attach_and_validation(env, other_env):
    h = env.admin_headers
    sid = _new_schedule(h)

    ok = client.post(
        f"/api/v1/recurring-schedules/{sid}/targets",
        headers=h,
        json={
            "kind": "workflow",
            "workflow_definition_id": str(env.workflow_id),
            "recipient_user_ids": [str(env.recipient1_id)],
        },
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["kind"] == "workflow"
    assert ok.json()["workflow_definition_id"] == str(env.workflow_id)
    assert ok.json()["target_name"] == "T Workflow"

    miss = client.post(f"/api/v1/recurring-schedules/{sid}/targets", headers=h, json={"kind": "workflow"})
    assert miss.status_code == 400

    # A workflow that belongs to another company must not be attachable.
    cross = client.post(
        f"/api/v1/recurring-schedules/{sid}/targets",
        headers=h,
        json={"kind": "workflow", "workflow_definition_id": str(other_env.workflow_id)},
    )
    assert cross.status_code == 404


def test_checklist_target_attach_and_validation(env, other_env):
    h = env.admin_headers
    sid = _new_schedule(h)

    ok = client.post(
        f"/api/v1/recurring-schedules/{sid}/targets",
        headers=h,
        json={"kind": "checklist", "checklist_id": str(env.checklist_id)},
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["kind"] == "checklist"
    assert ok.json()["checklist_id"] == str(env.checklist_id)

    miss = client.post(f"/api/v1/recurring-schedules/{sid}/targets", headers=h, json={"kind": "checklist"})
    assert miss.status_code == 400

    cross = client.post(
        f"/api/v1/recurring-schedules/{sid}/targets",
        headers=h,
        json={"kind": "checklist", "checklist_id": str(other_env.checklist_id)},
    )
    assert cross.status_code == 404


def test_acknowledge_target_needs_neither(env):
    h = env.admin_headers
    sid = _new_schedule(h)
    ok = client.post(
        f"/api/v1/recurring-schedules/{sid}/targets",
        headers=h,
        json={"kind": "acknowledge", "recipient_user_ids": [str(env.recipient1_id)]},
    )
    assert ok.status_code == 201, ok.text
    body = ok.json()
    assert body["kind"] == "acknowledge"
    assert body["workflow_definition_id"] is None
    assert body["checklist_id"] is None


# ── Part D: firing (process_recurring_schedules) ─────────────────────────────


@pytest.mark.parametrize("kind", ["workflow", "acknowledge"])
def test_firing_opens_run_and_one_obligation_per_recipient(db, env, notify_spy, kind):
    today = _utc_today()
    sched = _mk_schedule(db, env.company_id, by_monthday=today.day, start_date=today)
    over = {"workflow_definition_id": env.workflow_id} if kind == "workflow" else {}
    target = _mk_target(
        db, env.company_id, sched.id, kind,
        recipient_user_ids=[str(env.recipient1_id), str(env.recipient2_id)],
        **over,
    )
    db.commit()

    opened = rs.process_recurring_schedules(db, company_id=env.company_id)
    assert opened == 1

    runs = list(db.scalars(select(m.ScheduleRun).where(m.ScheduleRun.target_id == target.id)))
    assert len(runs) == 1
    assert runs[0].due_date == today
    assert runs[0].checklist_instance_id is None

    obs = list(db.scalars(select(m.ScheduleObligation).where(m.ScheduleObligation.run_id == runs[0].id)))
    assert {o.user_id for o in obs} == {env.recipient1_id, env.recipient2_id}
    assert all(o.status == "outstanding" for o in obs)
    # Initial notification went to the recipients.
    assert any(env.recipient1_id in (c.get("user_ids") or []) for c in notify_spy)

    # Idempotent: a second run the same day opens nothing new.
    assert rs.process_recurring_schedules(db, company_id=env.company_id) == 0
    runs_again = list(db.scalars(select(m.ScheduleRun).where(m.ScheduleRun.target_id == target.id)))
    assert len(runs_again) == 1


def test_firing_checklist_target_spawns_next_instance(db, env):
    sched = _mk_schedule(db, env.company_id)
    target = _mk_target(db, env.company_id, sched.id, "checklist", checklist_id=env.checklist_id)
    db.commit()

    before = db.scalar(
        select(func.count()).select_from(m.ChecklistInstance).where(
            m.ChecklistInstance.checklist_id == env.checklist_id
        )
    )
    assert before == 1  # base instance only

    opened = rs.process_recurring_schedules(db, company_id=env.company_id)
    assert opened == 1

    instances = list(
        db.scalars(
            select(m.ChecklistInstance)
            .where(m.ChecklistInstance.checklist_id == env.checklist_id)
            .order_by(m.ChecklistInstance.sequence)
        )
    )
    assert len(instances) == 2
    new = instances[-1]
    assert new.sequence == 2

    tasks = list(db.scalars(select(m.ChecklistTask).where(m.ChecklistTask.instance_id == new.id)))
    assert len(tasks) == len(env.base_task_titles)
    assert {t.title for t in tasks} == set(env.base_task_titles)
    assert all(t.status == "not_started" for t in tasks)  # clones reset

    run = db.scalar(select(m.ScheduleRun).where(m.ScheduleRun.target_id == target.id))
    assert run.checklist_instance_id == new.id
    # Checklist runs carry no obligations.
    assert list(db.scalars(select(m.ScheduleObligation).where(m.ScheduleObligation.run_id == run.id))) == []

    # Idempotent: no extra instance the same day.
    rs.process_recurring_schedules(db, company_id=env.company_id)
    after = db.scalar(
        select(func.count()).select_from(m.ChecklistInstance).where(
            m.ChecklistInstance.checklist_id == env.checklist_id
        )
    )
    assert after == 2


# ── Part E: reminders / escalation (process_schedule_reminders) ──────────────


def test_reminder_nags_outstanding_and_one_per_day(db, env, notify_spy):
    sched = _mk_schedule(db, env.company_id)
    target = _mk_target(db, env.company_id, sched.id, "acknowledge", remind_interval_days=1, remind_max_count=10)
    run = _mk_run(db, sched, target, _utc_today() - timedelta(days=1))
    ob = _mk_ob(db, sched, target, run, env.recipient1_id)
    db.commit()

    sent = rs.process_schedule_reminders(db, company_id=env.company_id)
    db.refresh(ob)
    assert sent >= 1
    assert ob.reminder_count == 1
    assert ob.last_reminded_at is not None
    assert any(env.recipient1_id in (c.get("user_ids") or []) for c in notify_spy)

    # Running again the same day must not double-nag.
    before = ob.reminder_count
    rs.process_schedule_reminders(db, company_id=env.company_id)
    db.refresh(ob)
    assert ob.reminder_count == before


def test_reminder_respects_max_count(db, env):
    sched = _mk_schedule(db, env.company_id)
    target = _mk_target(db, env.company_id, sched.id, "acknowledge", remind_max_count=1, remind_interval_days=1)
    run = _mk_run(db, sched, target, _utc_today() - timedelta(days=3))
    ob = _mk_ob(
        db, sched, target, run, env.recipient1_id,
        reminder_count=1, last_reminded_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    db.commit()

    rs.process_schedule_reminders(db, company_id=env.company_id)
    db.refresh(ob)
    assert ob.reminder_count == 1  # cap reached, unchanged


def test_reminder_respects_window_days(db, env):
    sched = _mk_schedule(db, env.company_id)
    target = _mk_target(
        db, env.company_id, sched.id, "acknowledge",
        remind_window_days=2, remind_interval_days=1, remind_max_count=10,
    )
    run = _mk_run(db, sched, target, _utc_today() - timedelta(days=5))  # 5 days > window 2
    ob = _mk_ob(db, sched, target, run, env.recipient1_id)
    db.commit()

    sent = rs.process_schedule_reminders(db, company_id=env.company_id)
    db.refresh(ob)
    assert sent == 0
    assert ob.reminder_count == 0  # outside the window, never nagged


def test_reminder_escalates_to_supervisor_once(db, env, notify_spy):
    sched = _mk_schedule(db, env.company_id)
    target = _mk_target(
        db, env.company_id, sched.id, "acknowledge",
        escalate_after_count=1, supervisor_user_id=env.supervisor_id,
        remind_interval_days=1, remind_max_count=10,
    )
    run = _mk_run(db, sched, target, _utc_today() - timedelta(days=1))
    ob = _mk_ob(db, sched, target, run, env.recipient1_id)
    db.commit()

    rs.process_schedule_reminders(db, company_id=env.company_id)
    db.refresh(ob)
    assert ob.reminder_count == 1
    assert ob.escalated_at is not None
    # First nag went to the recipient AND an escalation went to the supervisor.
    assert any(env.recipient1_id in (c.get("user_ids") or []) for c in notify_spy)
    assert any(env.supervisor_id in (c.get("user_ids") or []) for c in notify_spy)
    escalated_at = ob.escalated_at

    # Simulate a later day (allow another nag). The escalation must fire only once.
    ob.last_reminded_at = datetime.now(timezone.utc) - timedelta(days=1)
    db.commit()
    rs.process_schedule_reminders(db, company_id=env.company_id)
    db.refresh(ob)
    assert ob.reminder_count == 2          # nagged again
    assert ob.escalated_at == escalated_at  # but not re-escalated


def test_submitted_obligation_is_not_nagged(db, env):
    sched = _mk_schedule(db, env.company_id)
    target = _mk_target(db, env.company_id, sched.id, "acknowledge")
    run = _mk_run(db, sched, target, _utc_today() - timedelta(days=2))
    ob = _mk_ob(db, sched, target, run, env.recipient1_id, status="submitted")
    db.commit()

    sent = rs.process_schedule_reminders(db, company_id=env.company_id)
    db.refresh(ob)
    assert sent == 0
    assert ob.reminder_count == 0


# ── Part F: completion (close-on-submit + acknowledge) ───────────────────────


def test_close_obligation_on_workflow_submit(db, env):
    sched = _mk_schedule(db, env.company_id)
    target = _mk_target(
        db, env.company_id, sched.id, "workflow",
        workflow_definition_id=env.workflow_id,
        recipient_user_ids=[str(env.recipient1_id), str(env.recipient2_id)],
    )
    run = _mk_run(db, sched, target, date.today())
    ob1 = _mk_ob(db, sched, target, run, env.recipient1_id)
    ob2 = _mk_ob(db, sched, target, run, env.recipient2_id)
    db.commit()

    # recipient1 submits the linked workflow.
    inst = m.WorkflowInstance(
        company_id=env.company_id, workflow_definition_id=env.workflow_id,
        originator_user_id=env.recipient1_id, status="in_progress", workflow_name="T Workflow",
    )
    db.add(inst)
    db.flush()

    closed = rs.close_obligations_for_instance(db, inst)
    db.commit()
    db.refresh(ob1)
    db.refresh(ob2)

    assert closed == 1
    assert ob1.status == "submitted"
    assert ob1.instance_id == inst.id
    assert ob1.completed_at is not None
    # recipient2 did not submit — their obligation stays outstanding.
    assert ob2.status == "outstanding"


def test_acknowledge_obligation_own_only(db, env):
    sched = _mk_schedule(db, env.company_id)
    target = _mk_target(
        db, env.company_id, sched.id, "acknowledge", recipient_user_ids=[str(env.recipient1_id)]
    )
    run = _mk_run(db, sched, target, date.today())
    ob = _mk_ob(db, sched, target, run, env.recipient1_id)
    db.commit()

    # Someone else cannot acknowledge it.
    assert rs.acknowledge_obligation(db, ob.id, env.recipient2_id) is None
    db.refresh(ob)
    assert ob.status == "outstanding"

    # The owner can.
    done = rs.acknowledge_obligation(db, ob.id, env.recipient1_id)
    assert done is not None
    assert done.status == "submitted"
    assert done.completed_at is not None


def test_run_now_and_acknowledge_via_api(env):
    """End-to-end: create + attach + run-now, then a recipient acknowledges
    their own obligation (and cannot touch someone else's)."""
    h = env.admin_headers
    sid = client.post(
        "/api/v1/recurring-schedules",
        headers=h,
        json={"name": "API ack", "freq": "monthly", "by_monthday": 15, "at_hour": 0, "start_date": TODAY},
    ).json()["id"]

    at = client.post(
        f"/api/v1/recurring-schedules/{sid}/targets",
        headers=h,
        json={"kind": "acknowledge", "recipient_user_ids": [str(env.recipient1_id), str(env.recipient2_id)]},
    )
    assert at.status_code == 201, at.text

    rn = client.post(f"/api/v1/recurring-schedules/{sid}/run-now", headers=h)
    assert rn.status_code == 200, rn.text

    mine = client.get("/api/v1/recurring-schedules/mine/obligations", headers=env.recipient1_headers).json()
    obl = next((o for o in mine if o["schedule_id"] == sid), None)
    assert obl is not None
    assert obl["status"] == "outstanding"
    assert obl["completion_mode"] == "acknowledge"

    # recipient2 cannot acknowledge recipient1's obligation.
    bad = client.post(
        f"/api/v1/recurring-schedules/obligations/{obl['id']}/acknowledge",
        headers=env.recipient2_headers,
    )
    assert bad.status_code == 404

    # recipient1 acknowledges their own.
    ok = client.post(
        f"/api/v1/recurring-schedules/obligations/{obl['id']}/acknowledge",
        headers=env.recipient1_headers,
    )
    assert ok.status_code == 200
    assert ok.json()["status"] == "submitted"


# ── Part G: tenant isolation + auth ──────────────────────────────────────────


def test_tenant_isolation_schedule(env, other_env):
    a, b = env.admin_headers, other_env.admin_headers
    sid = _new_schedule(a)  # belongs to company A

    listed_b = client.get("/api/v1/recurring-schedules", headers=b).json()
    assert all(s["id"] != sid for s in listed_b)

    assert client.get(f"/api/v1/recurring-schedules/{sid}", headers=b).status_code == 404
    assert client.patch(f"/api/v1/recurring-schedules/{sid}", headers=b, json={"name": "hax"}).status_code == 404
    assert client.delete(f"/api/v1/recurring-schedules/{sid}", headers=b).status_code == 404

    # Company A still owns an intact schedule.
    assert client.get(f"/api/v1/recurring-schedules/{sid}", headers=a).status_code == 200


def test_tenant_isolation_target(env, other_env):
    a, b = env.admin_headers, other_env.admin_headers
    sid = _new_schedule(a)
    tid = client.post(
        f"/api/v1/recurring-schedules/{sid}/targets",
        headers=a,
        json={"kind": "acknowledge", "recipient_user_ids": [str(env.recipient1_id)]},
    ).json()["id"]

    assert client.patch(
        f"/api/v1/recurring-schedules/targets/{tid}", headers=b, json={"is_active": False}
    ).status_code == 404
    assert client.get(
        f"/api/v1/recurring-schedules/targets/{tid}/compliance", headers=b
    ).status_code == 404
    assert client.delete(f"/api/v1/recurring-schedules/targets/{tid}", headers=b).status_code == 404


def test_endpoints_require_auth():
    fresh = TestClient(app)
    assert fresh.get("/api/v1/recurring-schedules").status_code in (401, 403)
    assert fresh.get("/api/v1/recurring-schedules/mine/obligations").status_code in (401, 403)
    assert fresh.post(
        "/api/v1/recurring-schedules",
        json={"name": "x", "freq": "monthly", "by_monthday": 1, "start_date": TODAY},
    ).status_code in (401, 403)
