"""Document extraction for OCR-assisted form filling + voice-note transcription."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.core.deps import CurrentUser, require_company
from app.schemas.integrations import DocumentExtractOut
from app.schemas.request import VoiceTranscriptOut
from app.services import voice_notes
from app.services.ocr import extract_document_fields

router = APIRouter(prefix="/documents", tags=["Documents"])

_AUDIO_MAX = 25 * 1024 * 1024


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


@router.post("/transcribe", response_model=VoiceTranscriptOut)
async def transcribe_voice_note(
    file: UploadFile = File(...),
    language: str | None = Form(None),
    user: CurrentUser = Depends(require_company),
) -> VoiceTranscriptOut:
    """Transcribe a recorded voice note and return a polished comment draft.

    The audio is kept (linked to the request later, at submit). Transcription is
    CPU-heavy and serialised, so it runs off the event loop.
    """
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio")
    if len(content) > _AUDIO_MAX:
        raise HTTPException(status_code=413, detail="Audio too large (max 25MB)")

    ext = voice_notes.safe_ext(file.filename or (file.content_type or "").split("/")[-1])
    voice_note_id = voice_notes.save_audio(content, ext, user.company_id)

    path = voice_notes.audio_path(user.company_id, voice_note_id, ext)
    try:
        result = await run_in_threadpool(voice_notes.transcribe_file, path, language)
    except ImportError:
        raise HTTPException(status_code=503, detail="Transcription is not available on this server")
    except Exception:
        raise HTTPException(status_code=422, detail="Could not transcribe this audio")

    raw = result["text"]
    polished = await run_in_threadpool(voice_notes.polish_comment, raw, result.get("language"))
    return VoiceTranscriptOut(
        text=polished,
        raw_text=raw,
        language=result.get("language"),
        voice_note_id=voice_note_id,
        voice_note_ext=ext,
    )
