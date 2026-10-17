"""Suites API — no-code "applications" that group published processes.

Admin (WORKFLOWS_MANAGE) builds and orders suites; any company user reads the
end-user launcher. Static paths are declared before ``/{suite_id}`` so they match.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core import permissions as perms
from app.core.deps import CurrentUser, require_company, require_permission
from app.db.session import get_db
from app.schemas.suites import (
    LauncherOut,
    SuiteCreate,
    SuiteItemsUpdate,
    SuiteOut,
    SuiteProcessOut,
    SuiteReorder,
    SuiteTemplateCloneOut,
    SuiteTemplateOut,
    SuiteUpdate,
)
from app.services import suites as svc

router = APIRouter(prefix="/suites", tags=["Suites"])

ManageUser = Depends(require_permission(perms.WORKFLOWS_MANAGE))


# ── Admin: list / create ─────────────────────────────────────────────────────
@router.get("", response_model=list[SuiteOut])
def list_suites(user: CurrentUser = ManageUser, db: Session = Depends(get_db)) -> list[SuiteOut]:
    reps = svc.family_reps(db, user.company_id)
    return [SuiteOut(**svc.suite_detail(db, s, reps)) for s in svc.list_suites(db, user.company_id)]


@router.post("", response_model=SuiteOut, status_code=status.HTTP_201_CREATED)
def create_suite(
    body: SuiteCreate, user: CurrentUser = ManageUser, db: Session = Depends(get_db)
) -> SuiteOut:
    suite = svc.create_suite(
        db,
        user.company_id,
        name=body.name,
        description=body.description,
        icon=body.icon,
        accent=body.accent,
        family_ids=body.family_ids,
    )
    return SuiteOut(**svc.suite_detail(db, suite))


# ── End-user launcher (any company user) ─────────────────────────────────────
@router.get("/launcher", response_model=LauncherOut)
def launcher(
    user: CurrentUser = Depends(require_company), db: Session = Depends(get_db)
) -> LauncherOut:
    return LauncherOut(**svc.launcher_for_user(db, user.company_id, user.id))


# ── Admin: builder picker + templates + reorder ──────────────────────────────
@router.get("/available-processes", response_model=list[SuiteProcessOut])
def available_processes(
    user: CurrentUser = ManageUser, db: Session = Depends(get_db)
) -> list[SuiteProcessOut]:
    return [SuiteProcessOut(**p) for p in svc.available_processes(db, user.company_id)]


@router.get("/templates", response_model=list[SuiteTemplateOut])
def list_suite_templates(user: CurrentUser = ManageUser) -> list[SuiteTemplateOut]:
    _ = user
    return [SuiteTemplateOut(**t) for t in svc.list_suite_templates()]


@router.post(
    "/templates/{template_id}/clone",
    response_model=SuiteTemplateCloneOut,
    status_code=status.HTTP_201_CREATED,
)
def clone_suite_template(
    template_id: str, user: CurrentUser = ManageUser, db: Session = Depends(get_db)
) -> SuiteTemplateCloneOut:
    try:
        result = svc.clone_suite_template(db, user.company_id, template_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return SuiteTemplateCloneOut(**result)


@router.post("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_suites(
    body: SuiteReorder, user: CurrentUser = ManageUser, db: Session = Depends(get_db)
) -> None:
    svc.reorder_suites(db, user.company_id, body.ordered_ids)


# ── Admin: single suite ──────────────────────────────────────────────────────
def _get_or_404(db: Session, company_id: UUID, suite_id: UUID):
    suite = svc.get_suite(db, company_id, suite_id)
    if not suite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Suite not found")
    return suite


@router.get("/{suite_id}", response_model=SuiteOut)
def get_suite(
    suite_id: UUID, user: CurrentUser = ManageUser, db: Session = Depends(get_db)
) -> SuiteOut:
    suite = _get_or_404(db, user.company_id, suite_id)
    return SuiteOut(**svc.suite_detail(db, suite))


@router.patch("/{suite_id}", response_model=SuiteOut)
def update_suite(
    suite_id: UUID,
    body: SuiteUpdate,
    user: CurrentUser = ManageUser,
    db: Session = Depends(get_db),
) -> SuiteOut:
    suite = _get_or_404(db, user.company_id, suite_id)
    suite = svc.update_suite(db, suite, **body.model_dump(exclude_unset=True))
    return SuiteOut(**svc.suite_detail(db, suite))


@router.put("/{suite_id}/items", response_model=SuiteOut)
def set_suite_items(
    suite_id: UUID,
    body: SuiteItemsUpdate,
    user: CurrentUser = ManageUser,
    db: Session = Depends(get_db),
) -> SuiteOut:
    suite = _get_or_404(db, user.company_id, suite_id)
    suite = svc.set_items(db, suite, body.family_ids)
    return SuiteOut(**svc.suite_detail(db, suite))


@router.delete("/{suite_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_suite(
    suite_id: UUID, user: CurrentUser = ManageUser, db: Session = Depends(get_db)
) -> None:
    suite = _get_or_404(db, user.company_id, suite_id)
    svc.delete_suite(db, suite)
