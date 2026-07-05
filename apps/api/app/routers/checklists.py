"""Checklists: time-boxed sets of assignable tasks with no-login links and analytics."""

from __future__ import annotations

import csv
import io
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import CurrentUser, require_company, require_roles
from app.db.models import (
    Checklist,
    ChecklistEvent,
    ChecklistInstance,
    ChecklistTask,
    ChecklistTaskAttachment,
    Company,
)
from app.db.session import get_db
from app.schemas.checklists import (
    ChecklistCreate,
    ChecklistDetail,
    ChecklistReport,
    ChecklistSummary,
    ChecklistTaskOut,
    ChecklistUpdate,
    CompleteBody,
    PublicTaskView,
    ReassignBody,
    RejectBody,
    SkipBody,
    TaskAttachmentOut,
    TaskLibraryRow,
)
from app.services.checklists import build_report, gen_token, name_map, resolve_task_token, task_progress
from app.services.notifications import notify_users

router = APIRouter(prefix="/checklists", tags=["Checklists"])
MANAGER_ROLES = ("company_admin", "manager")

# File-upload guards (mirror public form uploads): PDF / JPG / PNG, 10 MB.
_MAGIC: list[tuple[bytes, str, str]] = [
    (b"\x25\x50\x44\x46", "application/pdf", ".pdf"),
    (b"\xff\xd8\xff", "image/jpeg", ".jpg"),
    (b"\x89\x50\x4e\x47\x0d\x0a\x1a\x0a", "image/png", ".png"),
]
_MAX_FILE_BYTES = 10 * 1024 * 1024


def _detect_mime(header: bytes) -> tuple[str, str] | None:
    for magic, mime, ext in _MAGIC:
        if header[: len(magic)] == magic:
            return mime, ext
    return None


def _can_manage(user: CurrentUser) -> bool:
    return any(r in MANAGER_ROLES for r in user.roles)


def _link(task: ChecklistTask) -> str:
    return f"{settings.app_url}/t/{task.access_token}"


def _event(
    db: Session,
    *,
    company_id: UUID,
    event_type: str,
    checklist_id: UUID | None = None,
    task_id: UUID | None = None,
    actor: UUID | None = None,
    payload: dict | None = None,
) -> None:
    db.add(
        ChecklistEvent(
            company_id=company_id,
            checklist_id=checklist_id,
            task_id=task_id,
            event_type=event_type,
            actor_user_id=actor,
            payload=payload or {},
        )
    )


# ── Output converters ───────────────────────────────────────────────────────────


def _task_out(task: ChecklistTask, checklist: Checklist, assignee_name: str | None) -> ChecklistTaskOut:
    return ChecklistTaskOut(
        id=task.id,
        checklist_id=task.checklist_id,
        instance_id=task.instance_id,
        checklist_name=checklist.name,
        title=task.title,
        description=task.description,
        assignee_user_id=task.assignee_user_id,
        assignee_name=assignee_name,
        due_date=task.due_date,
        priority=task.priority,
        weight=task.weight,
        attachment_required=task.attachment_required,
        order_index=task.order_index,
        status=task.status,
        completed_at=task.completed_at,
        completion_channel=task.completion_channel,
        approved_at=task.approved_at,
        reject_reason=task.reject_reason,
        verification_required=checklist.verification_required,
        timezone=checklist.timezone,
        link=_link(task) if task.access_token else None,
        attachments=[
            TaskAttachmentOut(
                id=a.id,
                original_filename=a.original_filename,
                size_bytes=a.size_bytes,
                created_at=a.created_at,
            )
            for a in sorted(task.attachments, key=lambda x: x.created_at)
        ],
    )


def _latest_instance(db: Session, checklist_id: UUID) -> ChecklistInstance | None:
    return db.scalar(
        select(ChecklistInstance)
        .where(ChecklistInstance.checklist_id == checklist_id)
        .order_by(ChecklistInstance.sequence.desc())
    )


def _summary(db: Session, cl: Checklist) -> ChecklistSummary:
    inst = _latest_instance(db, cl.id)
    tasks = (
        list(db.scalars(select(ChecklistTask).where(ChecklistTask.instance_id == inst.id))) if inst else []
    )
    total, done, pct = task_progress(tasks)
    return ChecklistSummary(
        id=cl.id,
        name=cl.name,
        description=cl.description,
        category=cl.category,
        status=cl.status,
        timezone=cl.timezone,
        start_date=cl.start_date,
        due_date=cl.due_date,
        recurrence=cl.recurrence,
        verification_required=cl.verification_required,
        task_count=total,
        done_count=done,
        progress_pct=pct,
        created_at=cl.created_at,
    )


def _detail(db: Session, cl: Checklist) -> ChecklistDetail:
    inst = _latest_instance(db, cl.id)
    tasks = (
        list(
            db.scalars(
                select(ChecklistTask)
                .where(ChecklistTask.instance_id == inst.id)
                .order_by(ChecklistTask.order_index, ChecklistTask.created_at)
            )
        )
        if inst
        else []
    )
    nm = name_map(db, {t.assignee_user_id for t in tasks})
    total, done, pct = task_progress(tasks)
    return ChecklistDetail(
        id=cl.id,
        name=cl.name,
        description=cl.description,
        category=cl.category,
        status=cl.status,
        timezone=cl.timezone,
        start_date=cl.start_date,
        due_date=cl.due_date,
        recurrence=cl.recurrence,
        verification_required=cl.verification_required,
        task_count=total,
        done_count=done,
        progress_pct=pct,
        created_at=cl.created_at,
        instance_id=inst.id if inst else None,
        completion_rule=cl.completion_rule,
        completion_threshold=cl.completion_threshold,
        carry_over=cl.carry_over,
        verifier_user_id=cl.verifier_user_id,
        tasks=[_task_out(t, cl, nm.get(t.assignee_user_id)) for t in tasks],
    )


# ── Notifications ───────────────────────────────────────────────────────────────


def _notify_new_assignments(db: Session, cl: Checklist, tasks: list[ChecklistTask]) -> None:
    by_assignee: dict[UUID, list[ChecklistTask]] = {}
    for t in tasks:
        if t.assignee_user_id:
            by_assignee.setdefault(t.assignee_user_id, []).append(t)
    for uid, ts in by_assignee.items():
        lines = [f'You have {len(ts)} task(s) in the checklist "{cl.name}":', ""]
        for t in ts:
            due = f" — due {t.due_date}" if t.due_date else ""
            lines.append(f"• {t.title}{due}")
            lines.append(f"  Open: {_link(t)}")
        notify_users(
            db,
            company_id=cl.company_id,
            user_ids=[uid],
            title=f"New checklist: {cl.name}",
            body="\n".join(lines),
            send_email=True,
            send_push=True,
        )


def _maybe_complete_instance(db: Session, instance_id: UUID) -> None:
    tasks = list(db.scalars(select(ChecklistTask).where(ChecklistTask.instance_id == instance_id)))
    if tasks and all(t.status in ("done", "skipped") for t in tasks):
        inst = db.get(ChecklistInstance, instance_id)
        if inst:
            inst.status = "completed"


# ── Task fetch + completion logic ───────────────────────────────────────────────


def _get_task(db: Session, task_id: UUID, company_id: UUID) -> ChecklistTask:
    task = db.get(ChecklistTask, task_id)
    if not task or task.company_id != company_id:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _apply_completion(db: Session, task: ChecklistTask, cl: Checklist, *, by: UUID | None, channel: str) -> None:
    if task.status == "done":
        raise HTTPException(status_code=400, detail="Task is already completed.")
    if task.status == "awaiting_approval":
        raise HTTPException(status_code=400, detail="Task is already awaiting approval.")
    if task.attachment_required and not task.attachments:
        raise HTTPException(status_code=400, detail="This task requires a file attachment before it can be completed.")
    now = datetime.now(timezone.utc)
    task.completed_at = now
    task.completed_by = by
    task.completion_channel = channel
    task.reject_reason = None
    if cl.verification_required:
        task.status = "awaiting_approval"
        verifier = cl.verifier_user_id or cl.created_by
        if verifier:
            notify_users(
                db,
                company_id=cl.company_id,
                user_ids=[verifier],
                title=f"Approval needed: {task.title}",
                body=f'"{task.title}" in checklist "{cl.name}" was completed and needs your approval.',
                send_email=True,
                send_push=True,
            )
    else:
        task.status = "done"
        task.approved_at = now
        _maybe_complete_instance(db, task.instance_id)
    _event(
        db,
        company_id=task.company_id,
        checklist_id=task.checklist_id,
        task_id=task.id,
        event_type="task_completed",
        actor=by,
        payload={"channel": channel, "verification": cl.verification_required},
    )


# ── Management endpoints (manager / admin) ──────────────────────────────────────


@router.post("", response_model=ChecklistDetail, status_code=status.HTTP_201_CREATED)
def create_checklist(
    body: ChecklistCreate,
    user: CurrentUser = Depends(require_roles(*MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> ChecklistDetail:
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Name is required.")
    if body.due_date < body.start_date:
        raise HTTPException(status_code=400, detail="Due date must be on or after the start date.")

    cl = Checklist(
        company_id=user.company_id,
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        category=(body.category or "").strip() or None,
        timezone=body.timezone or "UTC",
        start_date=body.start_date,
        due_date=body.due_date,
        recurrence=body.recurrence or "none",
        recurrence_config=body.recurrence_config or {},
        carry_over=body.carry_over or "reset",
        verification_required=body.verification_required,
        verifier_user_id=body.verifier_user_id,
        completion_rule=body.completion_rule or "all",
        completion_threshold=body.completion_threshold,
        created_by=user.id,
    )
    db.add(cl)
    db.flush()

    inst = ChecklistInstance(
        company_id=user.company_id,
        checklist_id=cl.id,
        period_start=body.start_date,
        period_end=body.due_date,
        sequence=1,
        status="active",
    )
    db.add(inst)
    db.flush()

    created_tasks: list[ChecklistTask] = []
    for i, t in enumerate(body.tasks):
        if not t.title.strip():
            continue
        if t.due_date and not (body.start_date <= t.due_date <= body.due_date):
            raise HTTPException(
                status_code=400,
                detail=f'Task "{t.title.strip()}" due date must fall within the checklist window.',
            )
        task = ChecklistTask(
            company_id=user.company_id,
            checklist_id=cl.id,
            instance_id=inst.id,
            title=t.title.strip(),
            description=(t.description or "").strip() or None,
            assignee_user_id=t.assignee_user_id,
            due_date=t.due_date,
            priority=t.priority or "normal",
            weight=t.weight or 1,
            attachment_required=t.attachment_required,
            order_index=t.order_index or i,
            access_token=gen_token(),
        )
        db.add(task)
        created_tasks.append(task)

    db.flush()
    _event(
        db,
        company_id=user.company_id,
        checklist_id=cl.id,
        event_type="checklist_created",
        actor=user.id,
        payload={"tasks": len(created_tasks)},
    )
    db.commit()
    db.refresh(cl)

    _notify_new_assignments(db, cl, created_tasks)
    db.commit()
    return _detail(db, cl)


@router.get("", response_model=list[ChecklistSummary])
def list_checklists(
    user: CurrentUser = Depends(require_roles(*MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> list[ChecklistSummary]:
    rows = db.scalars(
        select(Checklist)
        .where(Checklist.company_id == user.company_id)
        .order_by(Checklist.created_at.desc())
    )
    return [_summary(db, cl) for cl in rows]


@router.get("/task-library", response_model=list[TaskLibraryRow])
def task_library(
    q: str | None = Query(None),
    user: CurrentUser = Depends(require_roles(*MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> list[TaskLibraryRow]:
    """Tasks from every checklist's base instance (sequence 1) — for the clone/compose picker."""
    stmt = (
        select(ChecklistTask, Checklist.name)
        .join(Checklist, ChecklistTask.checklist_id == Checklist.id)
        .join(ChecklistInstance, ChecklistTask.instance_id == ChecklistInstance.id)
        .where(ChecklistTask.company_id == user.company_id, ChecklistInstance.sequence == 1)
        .order_by(Checklist.created_at.desc(), ChecklistTask.order_index)
    )
    out: list[TaskLibraryRow] = []
    needle = (q or "").strip().lower()
    for task, cname in db.execute(stmt):
        if needle and needle not in task.title.lower() and needle not in (cname or "").lower():
            continue
        out.append(
            TaskLibraryRow(
                checklist_id=task.checklist_id,
                checklist_name=cname,
                task_id=task.id,
                title=task.title,
                description=task.description,
            )
        )
    return out


@router.get("/my", response_model=list[ChecklistTaskOut])
def my_tasks(
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[ChecklistTaskOut]:
    rows = list(
        db.scalars(
            select(ChecklistTask)
            .where(
                ChecklistTask.company_id == user.company_id,
                ChecklistTask.assignee_user_id == user.id,
            )
            .order_by(ChecklistTask.due_date.is_(None), ChecklistTask.due_date, ChecklistTask.created_at)
        )
    )
    cl_ids = {t.checklist_id for t in rows}
    checklists = {c.id: c for c in db.scalars(select(Checklist).where(Checklist.id.in_(cl_ids)))} if cl_ids else {}
    nm = {user.id: user.full_name}
    return [_task_out(t, checklists[t.checklist_id], nm.get(t.assignee_user_id)) for t in rows if t.checklist_id in checklists]


@router.get("/report", response_model=ChecklistReport)
def report(
    checklist_id: UUID | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    user: CurrentUser = Depends(require_roles(*MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> ChecklistReport:
    return build_report(db, user.company_id, checklist_id=checklist_id, from_date=from_date, to_date=to_date)


@router.get("/report/export.csv")
def report_csv(
    checklist_id: UUID | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    user: CurrentUser = Depends(require_roles(*MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    rep = build_report(db, user.company_id, checklist_id=checklist_id, from_date=from_date, to_date=to_date)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Checklist", "Task", "Assignee", "Due date", "Completed on", "Status", "Outcome", "Variance (days)"])
    for r in rep.rows:
        w.writerow([
            r.checklist_name, r.title, r.assignee_name or "", r.due_date or "", r.completed_on or "",
            r.status, r.outcome, "" if r.variance_days is None else r.variance_days,
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="checklist-report.csv"'},
    )


# ── Single task endpoints ───────────────────────────────────────────────────────


@router.get("/tasks/{task_id}", response_model=ChecklistTaskOut)
def get_task(
    task_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> ChecklistTaskOut:
    task = _get_task(db, task_id, user.company_id)
    if not (_can_manage(user) or task.assignee_user_id == user.id):
        raise HTTPException(status_code=403, detail="Not your task.")
    cl = db.get(Checklist, task.checklist_id)
    nm = name_map(db, {task.assignee_user_id})
    return _task_out(task, cl, nm.get(task.assignee_user_id))


@router.post("/tasks/{task_id}/complete", response_model=ChecklistTaskOut)
def complete_task(
    task_id: UUID,
    body: CompleteBody,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> ChecklistTaskOut:
    task = _get_task(db, task_id, user.company_id)
    if not (_can_manage(user) or task.assignee_user_id == user.id):
        raise HTTPException(status_code=403, detail="Not your task.")
    cl = db.get(Checklist, task.checklist_id)
    _apply_completion(db, task, cl, by=user.id, channel="app")
    db.commit()
    db.refresh(task)
    nm = name_map(db, {task.assignee_user_id})
    return _task_out(task, cl, nm.get(task.assignee_user_id))


@router.post("/tasks/{task_id}/approve", response_model=ChecklistTaskOut)
def approve_task(
    task_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> ChecklistTaskOut:
    task = _get_task(db, task_id, user.company_id)
    cl = db.get(Checklist, task.checklist_id)
    if not (_can_manage(user) or cl.verifier_user_id == user.id):
        raise HTTPException(status_code=403, detail="Only the verifier or a manager can approve.")
    if task.status != "awaiting_approval":
        raise HTTPException(status_code=400, detail="Task is not awaiting approval.")
    task.status = "done"
    task.approved_at = datetime.now(timezone.utc)
    task.approved_by = user.id
    _maybe_complete_instance(db, task.instance_id)
    _event(db, company_id=task.company_id, checklist_id=task.checklist_id, task_id=task.id, event_type="task_approved", actor=user.id)
    if task.assignee_user_id:
        notify_users(
            db,
            company_id=task.company_id,
            user_ids=[task.assignee_user_id],
            title=f"Task approved: {task.title}",
            body=f'Your completion of "{task.title}" in "{cl.name}" was approved.',
            send_email=True,
            send_push=True,
        )
    db.commit()
    db.refresh(task)
    nm = name_map(db, {task.assignee_user_id})
    return _task_out(task, cl, nm.get(task.assignee_user_id))


@router.post("/tasks/{task_id}/reject", response_model=ChecklistTaskOut)
def reject_task(
    task_id: UUID,
    body: RejectBody,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> ChecklistTaskOut:
    task = _get_task(db, task_id, user.company_id)
    cl = db.get(Checklist, task.checklist_id)
    if not (_can_manage(user) or cl.verifier_user_id == user.id):
        raise HTTPException(status_code=403, detail="Only the verifier or a manager can reject.")
    if task.status != "awaiting_approval":
        raise HTTPException(status_code=400, detail="Task is not awaiting approval.")
    task.status = "in_progress"
    task.reject_reason = body.reason.strip()
    task.completed_at = None
    task.completed_by = None
    task.completion_channel = None
    _event(
        db,
        company_id=task.company_id,
        checklist_id=task.checklist_id,
        task_id=task.id,
        event_type="task_rejected",
        actor=user.id,
        payload={"reason": task.reject_reason},
    )
    if task.assignee_user_id:
        notify_users(
            db,
            company_id=task.company_id,
            user_ids=[task.assignee_user_id],
            title=f"Task returned: {task.title}",
            body=f'"{task.title}" in "{cl.name}" was returned: {task.reject_reason}\nOpen: {_link(task)}',
            send_email=True,
            send_push=True,
        )
    db.commit()
    db.refresh(task)
    nm = name_map(db, {task.assignee_user_id})
    return _task_out(task, cl, nm.get(task.assignee_user_id))


@router.post("/tasks/{task_id}/skip", response_model=ChecklistTaskOut)
def skip_task(
    task_id: UUID,
    body: SkipBody,
    user: CurrentUser = Depends(require_roles(*MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> ChecklistTaskOut:
    task = _get_task(db, task_id, user.company_id)
    cl = db.get(Checklist, task.checklist_id)
    task.status = "skipped"
    task.skip_reason = body.reason.strip()
    _maybe_complete_instance(db, task.instance_id)
    _event(
        db,
        company_id=task.company_id,
        checklist_id=task.checklist_id,
        task_id=task.id,
        event_type="task_skipped",
        actor=user.id,
        payload={"reason": task.skip_reason},
    )
    db.commit()
    db.refresh(task)
    nm = name_map(db, {task.assignee_user_id})
    return _task_out(task, cl, nm.get(task.assignee_user_id))


@router.post("/tasks/{task_id}/reassign", response_model=ChecklistTaskOut)
def reassign_task(
    task_id: UUID,
    body: ReassignBody,
    user: CurrentUser = Depends(require_roles(*MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> ChecklistTaskOut:
    task = _get_task(db, task_id, user.company_id)
    cl = db.get(Checklist, task.checklist_id)
    old_assignee = task.assignee_user_id
    task.assignee_user_id = body.assignee_user_id
    # Fresh no-login link; the old token is invalidated.
    task.access_token = gen_token()
    task.token_revoked = False
    _event(
        db,
        company_id=task.company_id,
        checklist_id=task.checklist_id,
        task_id=task.id,
        event_type="task_reassigned",
        actor=user.id,
        payload={"from": str(old_assignee) if old_assignee else None, "to": str(body.assignee_user_id), "reason": (body.reason or "").strip()},
    )
    notify_users(
        db,
        company_id=task.company_id,
        user_ids=[body.assignee_user_id],
        title=f"Task assigned to you: {task.title}",
        body=f'You are now responsible for "{task.title}" in "{cl.name}".'
        + (f" (due {task.due_date})" if task.due_date else "")
        + f"\nOpen: {_link(task)}",
        send_email=True,
        send_push=True,
    )
    db.commit()
    db.refresh(task)
    nm = name_map(db, {task.assignee_user_id})
    return _task_out(task, cl, nm.get(task.assignee_user_id))


# ── Attachments ─────────────────────────────────────────────────────────────────


def _store_attachment(db: Session, task: ChecklistTask, file_bytes: bytes, filename: str, uploaded_by: UUID | None) -> ChecklistTaskAttachment:
    if len(file_bytes) > _MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 10 MB limit.")
    detected = _detect_mime(file_bytes[:8])
    if detected is None:
        raise HTTPException(status_code=415, detail="Only PDF, JPG, and PNG files are allowed.")
    mime, ext = detected
    dest = Path(settings.file_storage_path) / "checklist"
    dest.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}{ext}"
    (dest / safe_name).write_bytes(file_bytes)
    att = ChecklistTaskAttachment(
        company_id=task.company_id,
        task_id=task.id,
        original_filename=(filename or "upload")[:255],
        storage_path=str(dest / safe_name),
        content_type=mime,
        size_bytes=len(file_bytes),
        uploaded_by=uploaded_by,
    )
    db.add(att)
    return att


@router.post("/tasks/{task_id}/attachments", response_model=TaskAttachmentOut, status_code=status.HTTP_201_CREATED)
async def upload_task_attachment(
    task_id: UUID,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> TaskAttachmentOut:
    task = _get_task(db, task_id, user.company_id)
    if not (_can_manage(user) or task.assignee_user_id == user.id):
        raise HTTPException(status_code=403, detail="Not your task.")
    content = await file.read()
    att = _store_attachment(db, task, content, file.filename or "upload", user.id)
    db.commit()
    db.refresh(att)
    return TaskAttachmentOut(id=att.id, original_filename=att.original_filename, size_bytes=att.size_bytes, created_at=att.created_at)


@router.get("/attachments/{att_id}/download")
def download_attachment(
    att_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> FileResponse:
    att = db.get(ChecklistTaskAttachment, att_id)
    if not att or att.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Attachment not found")
    task = db.get(ChecklistTask, att.task_id)
    if not (_can_manage(user) or (task and task.assignee_user_id == user.id)):
        raise HTTPException(status_code=403, detail="Not permitted.")
    if not Path(att.storage_path).exists():
        raise HTTPException(status_code=404, detail="File missing on disk")
    return FileResponse(att.storage_path, filename=att.original_filename, media_type=att.content_type or "application/octet-stream")


# ── Checklist detail / update / delete (param route — declared last) ─────────────


@router.get("/{checklist_id}", response_model=ChecklistDetail)
def get_checklist(
    checklist_id: UUID,
    user: CurrentUser = Depends(require_roles(*MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> ChecklistDetail:
    cl = db.get(Checklist, checklist_id)
    if not cl or cl.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return _detail(db, cl)


@router.patch("/{checklist_id}", response_model=ChecklistDetail)
def update_checklist(
    checklist_id: UUID,
    body: ChecklistUpdate,
    user: CurrentUser = Depends(require_roles(*MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> ChecklistDetail:
    cl = db.get(Checklist, checklist_id)
    if not cl or cl.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Checklist not found")
    if body.name is not None:
        cl.name = body.name.strip() or cl.name
    if body.description is not None:
        cl.description = body.description.strip() or None
    if body.category is not None:
        cl.category = body.category.strip() or None
    if body.status is not None:
        cl.status = body.status
    if body.verification_required is not None:
        cl.verification_required = body.verification_required
    if body.verifier_user_id is not None:
        cl.verifier_user_id = body.verifier_user_id
    db.commit()
    db.refresh(cl)
    return _detail(db, cl)


@router.delete("/{checklist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checklist(
    checklist_id: UUID,
    user: CurrentUser = Depends(require_roles(*MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> None:
    cl = db.get(Checklist, checklist_id)
    if not cl or cl.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Checklist not found")
    db.delete(cl)
    db.commit()


# ── No-login (token) endpoints ──────────────────────────────────────────────────


@router.get("/public/tasks/{token}", response_model=PublicTaskView)
def public_get_task(token: str, db: Session = Depends(get_db)) -> PublicTaskView:
    task = resolve_task_token(db, token)
    cl = db.get(Checklist, task.checklist_id)
    company = db.get(Company, task.company_id)
    nm = name_map(db, {task.assignee_user_id})
    return PublicTaskView(
        title=task.title,
        description=task.description,
        checklist_name=cl.name if cl else "",
        company_name=company.name if company else "",
        assignee_name=nm.get(task.assignee_user_id),
        due_date=task.due_date,
        status=task.status,
        attachment_required=task.attachment_required,
        attachments=[
            TaskAttachmentOut(id=a.id, original_filename=a.original_filename, size_bytes=a.size_bytes, created_at=a.created_at)
            for a in sorted(task.attachments, key=lambda x: x.created_at)
        ],
    )


@router.post("/public/tasks/{token}/complete", response_model=PublicTaskView)
def public_complete_task(token: str, db: Session = Depends(get_db)) -> PublicTaskView:
    task = resolve_task_token(db, token)
    cl = db.get(Checklist, task.checklist_id)
    _apply_completion(db, task, cl, by=task.assignee_user_id, channel="link")
    db.commit()
    return public_get_task(token, db)


@router.post("/public/tasks/{token}/upload", response_model=TaskAttachmentOut, status_code=status.HTTP_201_CREATED)
async def public_upload_attachment(token: str, file: UploadFile = File(...), db: Session = Depends(get_db)) -> TaskAttachmentOut:
    task = resolve_task_token(db, token)
    content = await file.read()
    att = _store_attachment(db, task, content, file.filename or "upload", task.assignee_user_id)
    db.commit()
    db.refresh(att)
    return TaskAttachmentOut(id=att.id, original_filename=att.original_filename, size_bytes=att.size_bytes, created_at=att.created_at)
