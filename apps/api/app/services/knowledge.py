"""Enterprise knowledge & RAG (D3).

A workspace attaches policies/SOPs/manuals; each is chunked and embedded, and the
copilots retrieve the most relevant chunks to ground their answers (with a citation
back to the document title). Retrieval is cosine similarity computed in Python over a
company's chunks — see KnowledgeChunk for the scale note.

Everything degrades off cleanly: no AI key / non-embedding provider / no documents →
``grounding_for_request`` returns None and the copilot runs ungrounded.
"""

from __future__ import annotations

import logging
import math
import re
from uuid import UUID

from sqlalchemy import select

from app.db.models import KnowledgeChunk, KnowledgeDoc, WorkflowDefinition, WorkflowInstance
from app.services import ai_gateway
from app.services.ai_client import AiError

logger = logging.getLogger(__name__)

_MIN_SCORE = 0.25  # below this a chunk is treated as irrelevant (don't inject noise)


def chunk_text(text: str, size: int = 1000, overlap: int = 150) -> list[str]:
    """Paragraph-aware greedy chunking; long paragraphs split with overlap."""
    text = (text or "").strip()
    if not text:
        return []
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    cur = ""
    for p in paras:
        if cur and len(cur) + len(p) + 2 <= size:
            cur = f"{cur}\n\n{p}"
        elif len(p) <= size:
            if cur:
                chunks.append(cur)
            cur = p
        else:
            if cur:
                chunks.append(cur)
                cur = ""
            start = 0
            step = max(1, size - overlap)
            while start < len(p):
                chunks.append(p[start : start + size])
                start += step
    if cur:
        chunks.append(cur)
    return chunks


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return -1.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return -1.0
    return dot / (na * nb)


def add_document(db, *, company_id: UUID, title: str, text: str, source: str | None, created_by: UUID | None) -> KnowledgeDoc:
    """Chunk + embed + store a document. Raises AiError if embeddings are unavailable."""
    chunks = chunk_text(text)
    if not chunks:
        raise ValueError("Document has no text to index")
    vectors = ai_gateway.embed(chunks, company_id=company_id)  # raises AiError on refusal/failure
    doc = KnowledgeDoc(company_id=company_id, title=title.strip()[:300], source=(source or None), created_by=created_by)
    db.add(doc)
    db.flush()
    for i, (content, vec) in enumerate(zip(chunks, vectors)):
        db.add(KnowledgeChunk(company_id=company_id, doc_id=doc.id, idx=i, content=content, embedding=vec))
    doc.chunk_count = len(chunks)
    db.commit()
    db.refresh(doc)
    return doc


def list_docs(db, company_id: UUID) -> list[KnowledgeDoc]:
    return list(
        db.scalars(
            select(KnowledgeDoc).where(KnowledgeDoc.company_id == company_id).order_by(KnowledgeDoc.created_at.desc())
        )
    )


def delete_doc(db, company_id: UUID, doc_id: UUID) -> bool:
    doc = db.get(KnowledgeDoc, doc_id)
    if not doc or doc.company_id != company_id:
        return False
    db.delete(doc)  # chunks cascade
    db.commit()
    return True


def search(db, company_id: UUID, query: str, k: int = 4) -> list[dict]:
    """Top-k relevant chunks for a query: [{content, title, score}]. Empty on any issue."""
    query = (query or "").strip()
    if not query:
        return []
    try:
        vecs = ai_gateway.embed([query], company_id=company_id)
    except AiError:
        return []
    if not vecs:
        return []
    qv = vecs[0]
    rows = db.scalars(select(KnowledgeChunk).where(KnowledgeChunk.company_id == company_id)).all()
    if not rows:
        return []
    titles = {d.id: d.title for d in list_docs(db, company_id)}
    scored = [(self_score, r) for r in rows if (self_score := _cosine(qv, r.embedding or [])) >= _MIN_SCORE]
    scored.sort(key=lambda t: t[0], reverse=True)
    return [
        {"content": r.content, "title": titles.get(r.doc_id, "Document"), "score": round(s, 4)}
        for s, r in scored[:k]
    ]


def grounding_for_request(db, inst: WorkflowInstance, defn: WorkflowDefinition | None) -> list[str] | None:
    """Policy excerpts relevant to a request, for the copilot (D2). None when nothing relevant."""
    data = inst.request_data or {}
    parts = [inst.workflow_name or (defn.name if defn else "")]
    for key, val in list(data.items())[:12]:
        if val not in (None, "", [], {}):
            parts.append(f"{key}: {val}")
    query = " | ".join(str(p) for p in parts if p)[:2000]
    hits = search(db, inst.company_id, query, k=3)
    if not hits:
        return None
    return [f"[{h['title']}] {h['content']}" for h in hits]


if __name__ == "__main__":  # self-check: chunking + cosine (no DB/AI)
    long = "Para one. " * 50 + "\n\n" + "Para two. " * 50
    cs = chunk_text(long, size=200, overlap=40)
    assert len(cs) >= 4 and all(len(c) <= 200 for c in cs), [len(c) for c in cs]
    assert chunk_text("") == []
    assert round(_cosine([1, 0, 0], [1, 0, 0]), 3) == 1.0
    assert round(_cosine([1, 0], [0, 1]), 3) == 0.0
    assert _cosine([1, 2], [1]) == -1.0  # mismatched dims
    print("knowledge self-check OK")
