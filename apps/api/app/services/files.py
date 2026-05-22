import re
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.config import settings

SAFE_NAME = re.compile(r"[^a-zA-Z0-9._-]+")


def save_upload(company_id: uuid.UUID, instance_id: uuid.UUID, file: UploadFile) -> tuple[str, str, int]:
    base = Path(settings.file_storage_path) / str(company_id) / str(instance_id)
    base.mkdir(parents=True, exist_ok=True)

    raw_name = file.filename or "upload"
    safe = SAFE_NAME.sub("_", raw_name).strip("_") or "upload"
    stored_name = f"{uuid.uuid4().hex[:8]}_{safe}"
    path = base / stored_name

    content = file.file.read()
    path.write_bytes(content)
    rel = str(path).replace("\\", "/")
    return rel, raw_name, len(content)
