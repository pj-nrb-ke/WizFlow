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

import httpx

from app.config import settings

_OPENAI_DEFAULT = "https://api.openai.com/v1"
_ANTHROPIC_DEFAULT = "https://api.anthropic.com/v1"


class AiError(RuntimeError):
    pass


def is_configured() -> bool:
    return bool((settings.ai_api_key or "").strip())


def provider() -> str:
    return (settings.ai_provider or "openai").strip().lower()


def _base_url(default: str) -> str:
    return (settings.ai_base_url or default).rstrip("/")


def chat(
    system: str,
    user: str,
    *,
    json_mode: bool = False,
    temperature: float = 0.3,
    max_tokens: int = 1024,
    timeout: float = 60.0,
) -> str:
    """Return the model's text reply. Raises AiError if unconfigured."""
    if not is_configured():
        raise AiError("No AI API key configured")
    if provider() == "anthropic":
        return _anthropic_chat(system, user, temperature=temperature, max_tokens=max_tokens, timeout=timeout)
    return _openai_chat(
        system, user, json_mode=json_mode, temperature=temperature, max_tokens=max_tokens, timeout=timeout
    )


def _openai_chat(system, user, *, json_mode, temperature, max_tokens, timeout) -> str:
    payload: dict = {
        "model": settings.ai_model,
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
        return (r.json()["choices"][0]["message"]["content"] or "").strip()


def _anthropic_chat(system, user, *, temperature, max_tokens, timeout) -> str:
    payload = {
        "model": settings.ai_model,
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
        parts = r.json().get("content") or []
        return "".join(p.get("text", "") for p in parts if isinstance(p, dict)).strip()


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
