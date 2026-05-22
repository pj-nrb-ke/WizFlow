from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db

router = APIRouter(tags=["Health"])


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    db_status = "ok"
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_status = "unavailable"
    return {"status": "ok", "version": settings.api_version, "database": db_status}
