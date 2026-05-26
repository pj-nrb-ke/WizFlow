"""Document extraction for OCR-assisted form filling."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.core.deps import CurrentUser, require_company
from app.schemas.integrations import DocumentExtractOut
from app.services.ocr import extract_document_fields

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.post("/extract", response_model=DocumentExtractOut)
async def extract_document(
    file: UploadFile = File(...),
    doc_type: str = Form("auto"),
    user: CurrentUser = Depends(require_company),
) -> DocumentExtractOut:
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")
    result = extract_document_fields(content, file.filename or "upload", doc_type)
    return DocumentExtractOut(**result)
