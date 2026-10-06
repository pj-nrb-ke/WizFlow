"""Business data model — low-code custom objects + records (Phase C).

Managers define typed entities (gated on workflow management); any company user
reads/writes records (validated against the entity's fields). Records are JSON
rows, queryable across apps. Row-level record permissions are a follow-up.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import permissions as perms
from app.core.deps import CurrentUser, require_company, require_permission
from app.db.models import BusinessEntity, BusinessRecord
from app.db.session import get_db
from app.schemas.business import (
    BusinessEntityCreate,
    BusinessEntityOut,
    BusinessEntitySummary,
    BusinessEntityUpdate,
    RecordIn,
    RecordOut,
)
from app.services.business_data import BusinessDataError, normalize_fields, slugify, validate_record

router = APIRouter(prefix="/business", tags=["Business data"])


def _get_entity(db: Session, entity_id: UUID, company_id: UUID) -> BusinessEntity:
    e = db.get(BusinessEntity, entity_id)
    if not e or e.company_id != company_id:
        raise HTTPException(status_code=404, detail="Entity not found")
    return e


def _get_record(db: Session, record_id: UUID, company_id: UUID) -> BusinessRecord:
    r = db.get(BusinessRecord, record_id)
    if not r or r.company_id != company_id:
        raise HTTPException(status_code=404, detail="Record not found")
    return r


# ── Entities (schema) ──
@router.get("/entities", response_model=list[BusinessEntitySummary])
def list_entities(user: CurrentUser = Depends(require_company), db: Session = Depends(get_db)):
    return list(
        db.scalars(
            select(BusinessEntity).where(BusinessEntity.company_id == user.company_id).order_by(BusinessEntity.name)
        )
    )


@router.post("/entities", response_model=BusinessEntityOut, status_code=status.HTTP_201_CREATED)
def create_entity(
    body: BusinessEntityCreate,
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
    db: Session = Depends(get_db),
) -> BusinessEntity:
    slug = slugify(body.name)
    if db.scalar(select(BusinessEntity).where(BusinessEntity.company_id == user.company_id, BusinessEntity.slug == slug)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An entity with that name already exists")
    e = BusinessEntity(
        company_id=user.company_id,
        name=body.name.strip(),
        slug=slug,
        description=(body.description or "").strip() or None,
        fields=normalize_fields(body.fields),
        created_by=user.id,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@router.get("/entities/{entity_id}", response_model=BusinessEntityOut)
def get_entity(entity_id: UUID, user: CurrentUser = Depends(require_company), db: Session = Depends(get_db)) -> BusinessEntity:
    return _get_entity(db, entity_id, user.company_id)


@router.patch("/entities/{entity_id}", response_model=BusinessEntityOut)
def update_entity(
    entity_id: UUID,
    body: BusinessEntityUpdate,
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
    db: Session = Depends(get_db),
) -> BusinessEntity:
    e = _get_entity(db, entity_id, user.company_id)
    data = body.model_dump(exclude_unset=True)
    if data.get("name") is not None:
        e.name = data["name"].strip()
    if "description" in data:
        e.description = (data["description"] or "").strip() or None
    if data.get("fields") is not None:
        e.fields = normalize_fields(data["fields"])
    db.commit()
    db.refresh(e)
    return e


@router.delete("/entities/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entity(
    entity_id: UUID,
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
    db: Session = Depends(get_db),
) -> None:
    db.delete(_get_entity(db, entity_id, user.company_id))
    db.commit()


# ── Records (data) ──
@router.get("/entities/{entity_id}/records", response_model=list[RecordOut])
def list_records(
    entity_id: UUID,
    q: str | None = Query(None, description="case-insensitive substring match across record values"),
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
):
    _get_entity(db, entity_id, user.company_id)
    rows = db.scalars(
        select(BusinessRecord)
        .where(BusinessRecord.entity_id == entity_id, BusinessRecord.company_id == user.company_id)
        .order_by(BusinessRecord.created_at.desc())
    )
    records = list(rows)
    if q:
        needle = q.lower()
        records = [r for r in records if needle in " ".join(str(v) for v in (r.data or {}).values()).lower()]
    return records


@router.post("/entities/{entity_id}/records", response_model=RecordOut, status_code=status.HTTP_201_CREATED)
def create_record(
    entity_id: UUID,
    body: RecordIn,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> BusinessRecord:
    e = _get_entity(db, entity_id, user.company_id)
    try:
        clean = validate_record(e.fields, body.data)
    except BusinessDataError as ex:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ex))
    r = BusinessRecord(company_id=user.company_id, entity_id=e.id, data=clean, created_by=user.id)
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.get("/records/{record_id}", response_model=RecordOut)
def get_record(record_id: UUID, user: CurrentUser = Depends(require_company), db: Session = Depends(get_db)) -> BusinessRecord:
    return _get_record(db, record_id, user.company_id)


@router.patch("/records/{record_id}", response_model=RecordOut)
def update_record(
    record_id: UUID,
    body: RecordIn,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> BusinessRecord:
    r = _get_record(db, record_id, user.company_id)
    e = _get_entity(db, r.entity_id, user.company_id)
    try:
        r.data = validate_record(e.fields, {**(r.data or {}), **body.data})
    except BusinessDataError as ex:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ex))
    db.commit()
    db.refresh(r)
    return r


@router.delete("/records/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_record(record_id: UUID, user: CurrentUser = Depends(require_company), db: Session = Depends(get_db)) -> None:
    db.delete(_get_record(db, record_id, user.company_id))
    db.commit()
