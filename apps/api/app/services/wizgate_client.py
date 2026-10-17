"""Client for WizGate — PJ's outbound integration gateway.

WizGate pushes approved WizFlow data into on-prem accounting apps (Sage Evolution,
Tally, QuickBooks) via a cloud API + an on-site connector. Every write/op goes
through ONE endpoint — ``POST /api/jobs/run-wait`` with a normalized
``operation`` + JSON ``payload`` — so this client is small and target-agnostic.

Key behaviours (per WizGate's contract):
  * Synchronous: run-wait waits for the connector and returns ``{status, resultJson, error}``.
  * ``resultJson`` is a JSON **string** — parse it. A *business* reject (e.g. "account
    not found") comes back inside it (HTTP 200), NOT as an HTTP error → WizGateBusinessError.
  * Transport failure (connector offline / 5xx / 429 / timeout) → WizGateError (retryable).
  * A 4xx (auth / permission / bad request) is permanent → WizGateBusinessError (surface, no loop).
  * Idempotency: pass a stable ``idempotency_key`` (the WizFlow request reference); a repeat
    returns the cached result and does not re-post.
  * Dry-run: ``operation="write.dryrun"`` with the real op nested in parameters — validates
    without posting (read-classified).
"""

from __future__ import annotations

import json

import httpx

DEFAULT_BASE_URL = "https://api.wizgate.app"


class WizGateError(RuntimeError):
    """Transport / HTTP / gateway failure — safe to retry (idempotency guards re-posts)."""


class WizGateBusinessError(WizGateError):
    """The op ran but was rejected on business grounds (missing account, out of balance…).
    Retrying as-is will keep failing — surface it, do not loop."""


def _parse_result(job: dict) -> dict:
    """Pull the business result out of a JobDto, raising on a business error."""
    rj = job.get("resultJson")
    data: dict = {}
    if isinstance(rj, str) and rj.strip():
        try:
            parsed = json.loads(rj)
            data = parsed if isinstance(parsed, dict) else {"result": parsed}
        except (ValueError, TypeError):
            data = {"raw": rj}
    elif isinstance(rj, dict):
        data = rj
    err = (data.get("error") if isinstance(data, dict) else None) or job.get("error")
    if err:
        raise WizGateBusinessError(str(err))
    return data


def run_op(
    *,
    base_url: str,
    api_key: str,
    site_id: str,
    operation: str,
    payload: dict | None = None,
    company: str | None = None,
    idempotency_key: str | None = None,
    timeout_seconds: int = 60,
    dry_run: bool = False,
) -> dict:
    """Run one WizGate operation and return its parsed result.

    ``dry_run`` wraps the op in ``write.dryrun`` (validates, posts nothing).
    Raises WizGateBusinessError on a business reject, WizGateError on transport failure.
    """
    if dry_run:
        inner: dict = {"operation": operation, "payload": json.dumps(payload or {}, default=str)}
        if company:
            inner["company"] = company
        body = {"siteId": site_id, "operation": "write.dryrun", "parameters": inner,
                "timeoutSeconds": timeout_seconds}
    else:
        inner = {}
        if payload is not None:
            inner["payload"] = json.dumps(payload, default=str)
        if company:
            inner["company"] = company
        body = {"siteId": site_id, "operation": operation, "parameters": inner,
                "timeoutSeconds": timeout_seconds}
        if idempotency_key:
            body["idempotencyKey"] = idempotency_key

    url = (base_url or DEFAULT_BASE_URL).rstrip("/") + "/api/jobs/run-wait"
    headers = {"Authorization": f"Bearer {api_key}", "accept": "application/json"}
    try:
        with httpx.Client(timeout=timeout_seconds + 15) as client:
            resp = client.post(url, headers=headers, json=body)
    except Exception as e:  # network / DNS / timeout
        raise WizGateError(f"WizGate unreachable: {type(e).__name__}") from e
    if resp.status_code == 429 or resp.status_code >= 500:
        raise WizGateError(f"WizGate HTTP {resp.status_code}: {resp.text[:300]}")
    if resp.status_code >= 400:
        # 4xx (auth / permission / bad request) is permanent — surface it and do NOT
        # retry-loop (e.g. a read-only key hitting a write → 403 write_forbidden).
        raise WizGateBusinessError(f"WizGate HTTP {resp.status_code}: {resp.text[:300]}")
    try:
        job = resp.json()
    except ValueError as e:
        raise WizGateError("WizGate returned a non-JSON response") from e
    return _parse_result(job)


def test_connection(*, base_url: str, api_key: str, site_id: str, timeout_seconds: int = 15) -> dict:
    """Cheap connectivity + auth check (the built-in ``ping`` op). Raises on failure."""
    return run_op(base_url=base_url, api_key=api_key, site_id=site_id,
                  operation="ping", payload=None, timeout_seconds=timeout_seconds)


if __name__ == "__main__":  # self-check: result parsing (no network)
    assert _parse_result({"status": "Completed", "resultJson": '{"ok": true, "sageTransactionId": 42}'})["sageTransactionId"] == 42
    try:
        _parse_result({"status": "Completed", "resultJson": '{"error": "account not found"}'})
        raise AssertionError("expected business error")
    except WizGateBusinessError as e:
        assert "account not found" in str(e)
    assert _parse_result({"resultJson": None}) == {}
    print("wizgate_client self-check OK")
