"""One provider-agnostic chat entry point for every WizFlow LLM call.

Providers (settings.ai_provider):
  * "openai" (default) — any OpenAI-compatible ``/chat/completions`` endpoint, so a
    single ``ai_base_url`` switch covers OpenAI, Azure, Groq, Together, OpenRouter,
    Ollama, vLLM, DeepSeek, Mistral, LocalAI, ...
  * "anthropic" — native ``/v1/messages``.

Callers pass (system, user) and get back text; ``json_mode`` asks for strict JSON
(OpenAI ``response_format``; Anthropic via the prompt) and the caller parses it
with ``parse_json``. Raises :class:`AiError` when no key is configured — callers
catch it and fall back to their template/raw path.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

import httpx

from app.config import settings

_OPENAI_DEFAULT = "https://api.openai.com/v1"
_ANTHROPIC_DEFAULT = "https://api.anthropic.com/v1"


class AiError(RuntimeError):
    pass


@dataclass
class ChatResult:
    """A completion plus the token usage reported by the provider (0 if absent)."""

    text: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0


def is_configured() -> bool:
    return bool((settings.ai_api_key or "").strip())


def provider() -> str:
    return (settings.ai_provider or "openai").strip().lower()


def _base_url(default: str) -> str:
    return (settings.ai_base_url or default).rstrip("/")


def complete(
    system: str,
    user: str,
    *,
    model: str | None = None,
    json_mode: bool = False,
    temperature: float = 0.3,
    max_tokens: int = 1024,
    timeout: float = 60.0,
) -> ChatResult:
    """Return text + token usage. Raises AiError if unconfigured. The metered entry
    point used by the AI gateway (D1); ``chat`` wraps it for the text-only callers."""
    if not is_configured():
        raise AiError("No AI API key configured")
    mdl = (model or settings.ai_model).strip()
    if provider() == "anthropic":
        return _anthropic_chat(system, user, model=mdl, temperature=temperature, max_tokens=max_tokens, timeout=timeout)
    return _openai_chat(
        system, user, model=mdl, json_mode=json_mode, temperature=temperature, max_tokens=max_tokens, timeout=timeout
    )


def chat(
    system: str,
    user: str,
    *,
    model: str | None = None,
    json_mode: bool = False,
    temperature: float = 0.3,
    max_tokens: int = 1024,
    timeout: float = 60.0,
) -> str:
    """Return the model's text reply. Raises AiError if unconfigured."""
    return complete(
        system, user, model=model, json_mode=json_mode,
        temperature=temperature, max_tokens=max_tokens, timeout=timeout,
    ).text


def _openai_chat(system, user, *, model, json_mode, temperature, max_tokens, timeout) -> ChatResult:
    payload: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    headers = {"Authorization": f"Bearer {settings.ai_api_key}", "Content-Type": "application/json"}
    with httpx.Client(timeout=timeout) as client:
        r = client.post(f"{_base_url(_OPENAI_DEFAULT)}/chat/completions", json=payload, headers=headers)
        r.raise_for_status()
        body = r.json()
        usage = body.get("usage") or {}
        return ChatResult(
            text=(body["choices"][0]["message"]["content"] or "").strip(),
            model=body.get("model") or model,
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
        )


def _anthropic_chat(system, user, *, model, temperature, max_tokens, timeout) -> ChatResult:
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    headers = {
        "x-api-key": settings.ai_api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=timeout) as client:
        r = client.post(f"{_base_url(_ANTHROPIC_DEFAULT)}/messages", json=payload, headers=headers)
        r.raise_for_status()
        body = r.json()
        parts = body.get("content") or []
        usage = body.get("usage") or {}
        return ChatResult(
            text="".join(p.get("text", "") for p in parts if isinstance(p, dict)).strip(),
            model=body.get("model") or model,
            prompt_tokens=int(usage.get("input_tokens") or 0),
            completion_tokens=int(usage.get("output_tokens") or 0),
        )


def embed(texts: list[str], *, model: str | None = None, timeout: float = 60.0) -> tuple[list[list[float]], int]:
    """Embed texts via an OpenAI-compatible /embeddings endpoint. Returns (vectors,
    total_tokens). Raises AiError when unconfigured or on a provider without embeddings
    (e.g. native Anthropic) — callers fall back to no grounding."""
    if not is_configured():
        raise AiError("No AI API key configured")
    if provider() == "anthropic":
        raise AiError("Embeddings require an OpenAI-compatible provider")
    if not texts:
        return [], 0
    mdl = (model or settings.ai_embed_model).strip()
    headers = {"Authorization": f"Bearer {settings.ai_api_key}", "Content-Type": "application/json"}
    with httpx.Client(timeout=timeout) as client:
        r = client.post(f"{_base_url(_OPENAI_DEFAULT)}/embeddings", json={"model": mdl, "input": texts}, headers=headers)
        r.raise_for_status()
        body = r.json()
        rows = sorted(body.get("data") or [], key=lambda d: d.get("index", 0))
        vectors = [row["embedding"] for row in rows]
        tokens = int((body.get("usage") or {}).get("total_tokens") or 0)
        return vectors, tokens


_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)


def parse_json(text: str) -> dict:
    """Parse a JSON object from an LLM reply, tolerating ```json fences / stray prose."""
    cleaned = _FENCE.sub("", (text or "").strip())
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start != -1 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


if __name__ == "__main__":  # self-check: provider dispatch + tolerant JSON parse
    assert provider() in ("openai", "anthropic")
    assert _base_url(_OPENAI_DEFAULT).endswith("/v1")
    assert parse_json('{"a": 1}') == {"a": 1}
    assert parse_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json('Here you go:\n{"a": [1,2]}\nthanks') == {"a": [1, 2]}
    try:
        chat("s", "u")  # no key in test env
        raise AssertionError("chat without key should raise")
    except AiError:
        pass
    print("ai_client self-check OK")
