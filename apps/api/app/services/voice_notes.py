"""Voice notes: transcribe an audio clip (faster-whisper) + polish it into a comment.

Self-hosted, free, CPU-only — mirrors what WizCRM proved (base / int8 / vad_filter),
but loaded once in-process (this backend is long-lived Python) instead of a per-call
CLI. WhisperModel is NOT thread-safe, so transcription is serialised behind a lock;
that is plenty for short request notes.

Audio is stored under ``file_storage_path/voice/<company_id>/<uuid>.<ext>`` and kept
(the originator's decision), referenced from the request's timeline comment event.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from uuid import UUID, uuid4

from app.config import settings
from app.services import ai_client

logger = logging.getLogger("wizflow.voice")

# ffmpeg (bundled via PyAV, plus the apt package) decodes all of these.
ALLOWED_EXT = {"webm", "ogg", "oga", "wav", "mp3", "m4a", "mp4", "aac", "flac"}

_model = None
_model_lock = threading.Lock()   # guards one-time model construction
_infer_lock = threading.Lock()   # serialises transcribe() — WhisperModel isn't thread-safe


def safe_ext(name_or_ext: str | None) -> str:
    """Return a whitelisted lowercase extension, defaulting to webm."""
    e = (name_or_ext or "").rsplit(".", 1)[-1].lower().strip()
    return e if e in ALLOWED_EXT else "webm"


def is_uuid_hex(s: str | None) -> bool:
    try:
        return bool(s) and UUID(hex=str(s)) is not None
    except (ValueError, AttributeError, TypeError):
        return False


def _voice_dir(company_id: UUID) -> Path:
    d = Path(settings.file_storage_path) / "voice" / str(company_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_audio(content: bytes, ext: str, company_id: UUID) -> str:
    """Persist the clip and return its opaque id (a uuid hex)."""
    vid = uuid4().hex
    (_voice_dir(company_id) / f"{vid}.{safe_ext(ext)}").write_bytes(content)
    return vid


def audio_path(company_id: UUID, voice_note_id: str, ext: str) -> Path:
    """Resolve a stored clip's path. Rejects a non-uuid id (path-traversal guard)."""
    if not is_uuid_hex(voice_note_id):
        raise ValueError("invalid voice_note_id")
    return _voice_dir(company_id) / f"{voice_note_id}.{safe_ext(ext)}"


def _get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from faster_whisper import WhisperModel  # heavy; import lazily

                _model = WhisperModel(
                    settings.whisper_model,
                    device=settings.whisper_device,
                    compute_type=settings.whisper_compute_type,
                    download_root=settings.whisper_model_dir or None,
                )
                logger.info("Loaded whisper model %r (%s/%s)", settings.whisper_model,
                            settings.whisper_device, settings.whisper_compute_type)
    return _model


def transcribe_file(path: str | Path, language: str | None = None) -> dict:
    """Transcribe an audio file → {text, language}. Serialised; blocking (run off-loop)."""
    model = _get_model()
    with _infer_lock:
        segments, info = model.transcribe(str(path), vad_filter=True, language=language or None)
        text = " ".join(seg.text.strip() for seg in segments).strip()
    return {"text": text, "language": getattr(info, "language", None)}


def polish_comment(text: str, language: str | None = None) -> str:
    """Clean grammar/spelling of a dictated note via the existing AI client.

    Falls back to the raw transcript when no AI key is set or the call fails —
    the feature must never lose the user's words to a cleanup hiccup.
    """
    text = (text or "").strip()
    if not text or not ai_client.is_configured():
        return text
    try:
        system = (
            "You clean up dictated notes for a business approval request. "
            "Fix grammar, spelling and punctuation and make it read clearly. "
            "Keep the original meaning and the original language, do not translate, "
            "and do not add information that isn't there. Return only the cleaned note."
        )
        return ai_client.chat(system, text, temperature=0.2) or text
    except Exception as e:  # pragma: no cover - network/LLM hiccup → keep raw
        logger.warning("polish_comment fell back to raw transcript: %s", e)
        return text


if __name__ == "__main__":  # tiny self-check: ext + path-traversal guards
    assert safe_ext("note.WEBM") == "webm"
    assert safe_ext("evil.exe") == "webm"
    assert safe_ext("clip.wav") == "wav"
    assert safe_ext(None) == "webm"
    assert is_uuid_hex(uuid4().hex)
    assert not is_uuid_hex("../../etc/passwd")
    assert not is_uuid_hex("")
    cid = uuid4()
    p = audio_path(cid, uuid4().hex, "wav")
    assert p.name.endswith(".wav") and "voice" in p.parts
    try:
        audio_path(cid, "../../secret", "wav")
        raise SystemExit("path-traversal guard failed")
    except ValueError:
        pass
    print("voice_notes self-check OK")
