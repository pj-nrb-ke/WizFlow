"""Seed 15–20+ items per UI module (inbox, my requests, notifications, statuses).

Run after scripts.seed + seed_custom_workflow_demo:
  SEED_FORCE=1 python -m scripts.seed_ample_volume

Docker:
  docker compose -p wizflow exec -e SEED_FORCE=1 -T api python -m scripts.seed_ample_volume
"""

import os
import random
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, func, select

from app.db.models import (
    Company,
    Notification,
    User,
    WorkflowDefinition,
    WorkflowInstance,
)
from app.db.session import SessionLocal
from app.services import instance_engine
from app.services.assignees import user_can_act, user_can_see_inbox
from app.services.initiators import user_can_initiate
from scripts.seed_custom_workflow_demo import MEGA_WORKFLOW_NAME, seed_custom_workflow_demo
from scripts.seed_rich import _clear_transactions, _notify_inbox, sample_data

COMPANY_SLUG = "demo-co"
TARGET_INBOX_PER_USER = 18
TARGET_REQUESTS_PER_ORIGINATOR = 18
TARGET_NOTIFICATIONS = 20

ORIGINATORS = ("originator@demo.wizflow.biz", "originator2@demo.wizflow.biz")
INBOX_SUBMITTER_EMAIL = "ops.user@demo.wizflow.biz"
ADMIN_EMAIL = "admin@demo.wizflow.biz"
APPROVERS = tuple(f"approver{i}@demo.wizflow.biz" for i in range(1, 9))

# Mega workflow step index (0-based) where each approver should see inbox items
MEGA_INBOX_STEP = {
    1: 0,
    2: 1,
    3: 2,
    4: 4,
    5: 5,
    6: 6,
    7: 6,
    8: 7,
}

# Who approves while advancing *past* step k (actor at step k)
MEGA_ADVANCE_ACTOR = {
    0: 1,
    1: 2,
    2: 3,
    3: 2,
    4: 4,
    5: 5,
    6: 6,
}


def _mega_sample(defn: WorkflowDefinition) -> dict:
    return {
        "project_name": f"Demo project {random.randint(100, 999)}",
        "amount": random.randint(50000, 500000),
        "business_case": "Strategic investment for FY26 operations.",
        "department": random.choice(["it", "ops", "fin"]),
    }


def _submit(db, defn, originator_id, company_id, data=None, *, low_amount: bool = False):
    inst = instance_engine.submit_request(
        db,
        defn=defn,
        user_id=originator_id,
        company_id=company_id,
        data=data or sample_data(defn, low_amount=low_amount),
    )
    _notify_inbox(db, inst)
    return inst


def _actor_for_step(approver_by_num: dict[int, User], step_idx: int) -> uuid.UUID:
    num = MEGA_ADVANCE_ACTOR.get(step_idx, 8)
    return approver_by_num[num].id


def _park_mega_at_step(db, inst, defn, target_step_idx: int, approver_by_num: dict[int, User]) -> None:
    """Approve through steps until current step index is target_step_idx."""
    seq = inst.step_sequence or []
    guard = 0
    while inst.status == "in_progress" and inst.current_step_id and guard < 12:
        guard += 1
        try:
            cur_idx = seq.index(inst.current_step_id)
        except ValueError:
            break
        if cur_idx >= target_step_idx:
            break
        actor_id = _actor_for_step(approver_by_num, cur_idx)
        if not user_can_act(inst, actor_id) and inst.assignees:
            actor_id = uuid.UUID(inst.assignees[0]["user_id"])
        instance_engine.approve_request(db, inst, defn, actor_id, "Seed advance")
        if inst.status == "in_progress" and inst.assignees:
            _notify_inbox(db, inst)


def _count_inbox(db, company_id, user_id):
    rows = db.scalars(
        select(WorkflowInstance).where(
            WorkflowInstance.company_id == company_id,
            WorkflowInstance.status == "in_progress",
        )
    )
    return sum(1 for i in rows if user_can_see_inbox(i, user_id))


def _count_originator_requests(db, company_id, user_id):
    return (
        db.scalar(
            select(func.count())
            .select_from(WorkflowInstance)
            .where(
                WorkflowInstance.company_id == company_id,
                WorkflowInstance.originator_user_id == user_id,
            )
        )
        or 0
    )


def _approve_until_done(db, inst, defn, actor_id):
    guard = 0
    while inst.status == "in_progress" and guard < 12:
        try:
            if user_can_act(inst, actor_id):
                instance_engine.approve_request(db, inst, defn, actor_id, "OK")
            elif inst.assignees:
                aid = uuid.UUID(inst.assignees[0]["user_id"])
                instance_engine.approve_request(db, inst, defn, aid, "OK")
            else:
                break
        except Exception:
            break
        guard += 1
        if inst.status == "in_progress" and inst.assignees:
            _notify_inbox(db, inst)


def seed_ample_volume(*, force: bool | None = None) -> None:
    if force is None:
        force = os.environ.get("SEED_FORCE", "").strip().lower() in ("1", "true", "yes")
    seed_custom_workflow_demo()

    db = SessionLocal()
    try:
        company = db.scalar(select(Company).where(Company.slug == COMPANY_SLUG))
        if not company:
            print("demo-co missing — run scripts.seed first.")
            return

        admin = db.scalar(select(User).where(User.email == ADMIN_EMAIL))
        inbox_submitter = db.scalar(select(User).where(User.email == INBOX_SUBMITTER_EMAIL))
        if not inbox_submitter:
            print(f"Missing {INBOX_SUBMITTER_EMAIL} — run seed_custom_workflow_demo.")
            return

        published = list(
            db.scalars(
                select(WorkflowDefinition).where(
                    WorkflowDefinition.company_id == company.id,
                    WorkflowDefinition.status == "published",
                )
            )
        )
        mega = next((w for w in published if w.name == MEGA_WORKFLOW_NAME), None)
        petty_wf = next((w for w in published if w.name == "Petty Cash Approval"), None)
        # petty_wf used below for admin inbox + per-form seeding
        wf_pool = [w for w in published if w.name not in (MEGA_WORKFLOW_NAME,)][:8]

        if not mega:
            print(f"Warning: {MEGA_WORKFLOW_NAME} not found.")

        inst_count = db.scalar(
            select(func.count()).select_from(WorkflowInstance).where(WorkflowInstance.company_id == company.id)
        ) or 0
        if inst_count >= 120 and not force:
            print(f"Ample seed skipped ({inst_count} instances). Set SEED_FORCE=1 to rebuild.")
            return

        if force or inst_count > 0:
            _clear_transactions(db, company.id)
            db.execute(delete(Notification).where(Notification.company_id == company.id))
            print("Cleared existing requests and notifications.")

        originator_users = [
            db.scalar(select(User).where(User.email == e)) for e in ORIGINATORS
        ]
        originator_users = [u for u in originator_users if u]
        approver_users = [
            db.scalar(select(User).where(User.email == e)) for e in APPROVERS
        ]
        approver_users = [u for u in approver_users if u]
        approver_by_num = {i + 1: u for i, u in enumerate(approver_users)}

        stats = {"approved": 0, "in_progress": 0, "rejected": 0, "returned": 0, "inbox_mega": 0}

        def _submitters_for(defn: WorkflowDefinition) -> list:
            pool = originator_users + ([admin] if admin else [])
            return [u for u in pool if user_can_initiate(db, u.id, defn)]

        # --- At least 2 submissions per published form (varied amounts) ---
        for defn in published:
            candidates = _submitters_for(defn)
            if not candidates:
                continue
            for _ in range(2):
                u = random.choice(candidates)
                data = sample_data(defn)
                if defn.name == MEGA_WORKFLOW_NAME:
                    data = _mega_sample(defn)
                elif petty_wf and defn.id == petty_wf.id:
                    data["amount"] = random.randint(5100, 75000)
                _submit(db, defn, u.id, company.id, data)

        # --- My requests: exactly 18 per originator (mixed statuses) ---
        random.shuffle(wf_pool)
        for o_user in originator_users:
            for _ in range(TARGET_REQUESTS_PER_ORIGINATOR):
                defn = random.choice(wf_pool or published)
                roll = random.random()
                if roll < 0.35:
                    inst = _submit(db, defn, o_user.id, company.id)
                    _approve_until_done(db, inst, defn, admin.id)
                    stats["approved"] += 1
                elif roll < 0.55:
                    _submit(db, defn, o_user.id, company.id)
                    stats["in_progress"] += 1
                elif roll < 0.75:
                    inst = _submit(db, defn, o_user.id, company.id)
                    instance_engine.reject_request(db, inst, admin.id, "Demo reject")
                    stats["rejected"] += 1
                else:
                    inst = _submit(db, defn, o_user.id, company.id)
                    instance_engine.return_request(db, inst, admin.id, "Demo return")
                    stats["returned"] += 1

        # --- Admin "My requests" (admin can submit any standard workflow) ---
        if admin:
            admin_pool = [d for d in published if user_can_initiate(db, admin.id, d)]
            random.shuffle(admin_pool)
            for i in range(TARGET_REQUESTS_PER_ORIGINATOR):
                if not admin_pool:
                    break
                defn = admin_pool[i % len(admin_pool)]
                data = sample_data(defn)
                if defn.name == MEGA_WORKFLOW_NAME:
                    data = _mega_sample(defn)
                elif petty_wf and defn.id == petty_wf.id:
                    data["amount"] = random.randint(900, 4200)
                roll = random.random()
                if roll < 0.4:
                    inst = _submit(db, defn, admin.id, company.id, data)
                    _approve_until_done(db, inst, defn, admin.id)
                    stats["approved"] += 1
                elif roll < 0.7:
                    _submit(db, defn, admin.id, company.id, data)
                    stats["in_progress"] += 1
                else:
                    inst = _submit(db, defn, admin.id, company.id, data)
                    instance_engine.reject_request(db, inst, admin.id, "Demo reject")
                    stats["rejected"] += 1

        # --- 8-step showcase: mega parked at steps 3, 5, 7 (submitter: ops.user) ---
        if mega:
            for step_idx, num in [(2, 3), (4, 5), (6, 7)]:
                inst = _submit(db, mega, inbox_submitter.id, company.id, _mega_sample(mega))
                _park_mega_at_step(db, inst, mega, step_idx, approver_by_num)
                stats["inbox_mega"] += 1

        # --- Inbox: 18 mega items parked at each approver's step (ops.user submits) ---
        if mega:
            for num, step_idx in MEGA_INBOX_STEP.items():
                au = approver_by_num.get(num)
                if not au:
                    continue
                need = max(0, TARGET_INBOX_PER_USER - _count_inbox(db, company.id, au.id))
                for _ in range(need):
                    inst = _submit(db, mega, inbox_submitter.id, company.id, _mega_sample(mega))
                    _park_mega_at_step(db, inst, mega, step_idx, approver_by_num)
                    stats["inbox_mega"] += 1

        # --- Admin inbox: finance step (random amounts > 5000) ---
        if admin and petty_wf:
            need = max(0, TARGET_INBOX_PER_USER - _count_inbox(db, company.id, admin.id))
            for _ in range(need):
                data = sample_data(petty_wf)
                data["amount"] = random.randint(5100, 89000)
                data["purpose"] = f"Finance review #{random.randint(1000, 9999)}"
                _submit(db, petty_wf, inbox_submitter.id, company.id, data)
                stats["in_progress"] += 1

        # --- Notifications: 20 per key user (drop inbox emails from submit/approve) ---
        db.execute(delete(Notification).where(Notification.company_id == company.id))
        key_users = originator_users + approver_users[:4] + ([admin] if admin else [])
        for u in key_users:
            for n in range(TARGET_NOTIFICATIONS):
                db.add(
                    Notification(
                        company_id=company.id,
                        user_id=u.id,
                        title=f"Demo notice {n + 1}",
                        body="Sample notification for UI testing.",
                        read=(n % 2 == 0),
                    )
                )

        db.commit()

        print("Ample volume seed complete.")
        for email in (ADMIN_EMAIL,) + ORIGINATORS + APPROVERS[:3]:
            u = db.scalar(select(User).where(User.email == email))
            if not u:
                continue
            ib = _count_inbox(db, company.id, u.id)
            req = _count_originator_requests(db, company.id, u.id)
            unread = db.scalar(
                select(func.count()).select_from(Notification).where(
                    Notification.company_id == company.id,
                    Notification.user_id == u.id,
                    Notification.read.is_(False),
                )
            ) or 0
            print(f"  {email}: inbox={ib}, my_requests={req}, unread_notifications={unread}")
        total = db.scalar(
            select(func.count()).select_from(WorkflowInstance).where(WorkflowInstance.company_id == company.id)
        )
        mega_steps = len(mega.steps) if mega else 0
        print(
            f"  Total instances: {total} | mega_steps={mega_steps} "
            f"| approved={stats['approved']} rejected={stats['rejected']} "
            f"returned={stats['returned']} inbox_mega={stats['inbox_mega']}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    seed_ample_volume()
