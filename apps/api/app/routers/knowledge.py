"""Knowledge base API (D3) — manage the documents that ground the copilots.

Gated on WORKFLOWS_MANAGE (the build capability): managers/admins curate knowledge;
retrieval itself is internal to the copilots.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core import permissions as perms
from app.core.deps import CurrentUser, require_permission
from app.db.session import get_db
from app.schemas.knowledge import KnowledgeDocCreate, KnowledgeDocOut, KnowledgeSearchHit
from app.services import knowledge
from app.services.ai_client import AiError

router = APIRouter(prefix="/knowledge", tags=["Knowledge"])


@router.get("/docs", response_model=list[KnowledgeDocOut])
def list_docs(
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
    db: Session = Depends(get_db),
):
    return knowledge.list_docs(db, user.company_id)


@router.post("/docs", response_model=KnowledgeDocOut, status_code=status.HTTP_201_CREATED)
def create_doc(
    body: KnowledgeDocCreate,
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
    db: Session = Depends(get_db),
):
    try:
        return knowledge.add_document(
            db, company_id=user.company_id, title=body.title, text=body.text,
            source=body.source, created_by=user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except AiError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not index the document — embeddings unavailable ({e}).",
        )


@router.delete("/docs/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_doc(
    doc_id: UUID,
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
    db: Session = Depends(get_db),
):
    if not knowledge.delete_doc(db, user.company_id, doc_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")


@router.get("/search", response_model=list[KnowledgeSearchHit])
def search(
    q: str = Query(..., min_length=1),
    k: int = Query(4, ge=1, le=10),
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
    db: Session = Depends(get_db),
):
    return knowledge.search(db, user.company_id, q, k=k)
