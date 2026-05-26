"""Document field extraction (OCR foundation — text/heuristic; no ERP)."""

from __future__ import annotations

import re
from typing import Any

AMOUNT_RE = re.compile(r"(?:total|amount|kes|ksh|usd|\$)\s*[:#]?\s*([\d,]+(?:\.\d{2})?)", re.I)
DATE_RE = re.compile(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b")
INVOICE_RE = re.compile(r"invoice\s*#?\s*([A-Z0-9-]+)", re.I)
CHEQUE_RE = re.compile(r"cheque\s*#?\s*(\d+)", re.I)


def _decode_text(content: bytes, filename: str) -> str:
    lower = filename.lower()
    if lower.endswith((".txt", ".csv", ".json", ".md")):
        try:
            return content.decode("utf-8", errors="ignore")
        except Exception:
            return ""
    try:
        return content.decode("utf-8", errors="ignore")
    except Exception:
        return ""


def _field(key: str, value: Any, confidence: float, source: str = "heuristic") -> dict:
    return {"key": key, "value": value, "confidence": round(confidence, 2), "source": source}


def extract_document_fields(
    content: bytes,
    filename: str,
    doc_type: str = "auto",
) -> dict[str, Any]:
    """Extract structured fields with confidence scores for human review."""
    text = _decode_text(content, filename)
    fields: list[dict] = []
    doc = doc_type if doc_type != "auto" else _guess_type(filename, text)

    if AMOUNT_RE.search(text):
        m = AMOUNT_RE.search(text)
        if m:
            fields.append(_field("amount", m.group(1).replace(",", ""), 0.75))
    if DATE_RE.search(text):
        fields.append(_field("date", DATE_RE.search(text).group(1), 0.7))
    if doc == "invoice" and INVOICE_RE.search(text):
        fields.append(_field("invoice_number", INVOICE_RE.search(text).group(1), 0.8))
    if doc == "cheque" and CHEQUE_RE.search(text):
        fields.append(_field("cheque_number", CHEQUE_RE.search(text).group(1), 0.8))

    if not fields and len(text) > 20:
        fields.append(_field("raw_text_preview", text[:400].strip(), 0.5, "text"))

    overall = max((f["confidence"] for f in fields), default=0.0)
    return {
        "document_type": doc,
        "fields": fields,
        "overall_confidence": overall,
        "requires_review": overall < 0.7 or len(fields) == 0,
        "message": (
            "Review extracted values before submitting."
            if fields
            else "No structured fields detected. Enter details manually or upload a text-based document."
        ),
    }


def _guess_type(filename: str, text: str) -> str:
    blob = f"{filename} {text[:200]}".lower()
    if "cheque" in blob or "check" in blob:
        return "cheque"
    if "invoice" in blob:
        return "invoice"
    if "receipt" in blob:
        return "receipt"
    return "general"
