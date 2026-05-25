"""Deep HTTP integration smoke tests for WizFlow API.

Run from repo (host API port):
  python apps/api/scripts/test_integration_deep.py

Run inside Docker:
  docker compose -p wizflow exec -T api python -m scripts.test_integration_deep
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

def _default_api_base() -> str:
    if os.environ.get("WIZFLOW_API_BASE"):
        return os.environ["WIZFLOW_API_BASE"]
    if os.path.exists("/.dockerenv"):
        return "http://api:8000/api/v1"
    return "http://127.0.0.1:8010/api/v1"


DEFAULT_BASE = _default_api_base()
PASSWORD = "changeme"
PETTY_WF_NAME = "Petty Cash Approval"
ADMIN = "admin@demo.wizflow.biz"
ORIGINATOR = "originator@demo.wizflow.biz"
APPROVER1 = "approver1@demo.wizflow.biz"
MIN_ADMIN_REQUESTS = 15
MIN_PETTY_AMOUNT_VARIANTS = 8


@dataclass
class Result:
    name: str
    ok: bool
    detail: str = ""


class ApiClient:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")

    def request(
        self,
        method: str,
        path: str,
        *,
        token: str | None = None,
        body: dict | None = None,
        expect: int | tuple[int, ...] | None = None,
    ) -> tuple[int, Any]:
        url = f"{self.base}{path}"
        headers: dict[str, str] = {}
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        if token:
            headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                status = resp.status
                raw = resp.read().decode()
        except urllib.error.HTTPError as e:
            status = e.code
            raw = e.read().decode()
        parsed: Any
        if raw:
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                parsed = raw
        else:
            parsed = None
        if expect is not None:
            allowed = (expect,) if isinstance(expect, int) else expect
            if status not in allowed:
                raise AssertionError(f"{method} {path} expected {allowed}, got {status}: {parsed}")
        return status, parsed

    def login(self, email: str) -> dict:
        _, data = self.request(
            "POST",
            "/auth/login",
            body={"email": email, "password": PASSWORD},
            expect=200,
        )
        assert isinstance(data, dict) and data.get("access_token"), f"login failed for {email}"
        return data


def _petty_workflow_id(client: ApiClient, token: str) -> str:
    _, workflows = client.request("GET", "/workflows?initiator_only=true", token=token["access_token"])
    assert isinstance(workflows, list)
    for w in workflows:
        if w.get("name") == PETTY_WF_NAME and w.get("status") == "published":
            return str(w["id"])
    raise AssertionError(f"published workflow {PETTY_WF_NAME!r} not found")


def run(base: str = DEFAULT_BASE) -> list[Result]:
    client = ApiClient(base)
    results: list[Result] = []

    def record(name: str, ok: bool, detail: str = "") -> None:
        results.append(Result(name, ok, detail))

    # Health
    try:
        status, data = client.request("GET", "/health", expect=200)
        ok = status == 200 and isinstance(data, dict) and data.get("status") == "ok"
        record("health /api/v1/health", ok, str(data)[:120])
    except Exception as e:
        record("health /api/v1/health", False, str(e))

    tokens: dict[str, dict] = {}
    for email in (ADMIN, ORIGINATOR, APPROVER1):
        try:
            tokens[email] = client.login(email)
            record(f"login {email}", True)
        except Exception as e:
            record(f"login {email}", False, str(e))

    for label, path in (
        ("GET inbox", "/inbox"),
        ("GET requests", "/requests"),
        ("GET workflows", "/workflows"),
    ):
        try:
            tok = tokens.get(ADMIN, {}).get("access_token")
            if not tok:
                raise RuntimeError("admin login missing")
            status, data = client.request("GET", path, token=tok, expect=200)
            ok = status == 200 and isinstance(data, list)
            record(label, ok, f"count={len(data) if isinstance(data, list) else 'n/a'}")
        except Exception as e:
            record(label, False, str(e))

    # Admin my_requests count
    try:
        _, reqs = client.request("GET", "/requests", token=tokens[ADMIN]["access_token"], expect=200)
        n = len(reqs) if isinstance(reqs, list) else 0
        record("admin my_requests >= 15", n >= MIN_ADMIN_REQUESTS, f"count={n}")
    except Exception as e:
        record("admin my_requests >= 15", False, str(e))

    # Petty cash amount variety (my requests + inbox lists)
    try:
        amounts: set[str] = set()
        for path, tok in (
            ("/requests", tokens[ADMIN]["access_token"]),
            ("/inbox", tokens[ADMIN]["access_token"]),
        ):
            _, rows = client.request("GET", path, token=tok, expect=200)
            for r in rows or []:
                name = r.get("workflow_name")
                if name != PETTY_WF_NAME:
                    continue
                prev = r.get("amount_preview")
                if prev is not None:
                    amounts.add(str(prev))
        record(
            "petty cash amounts vary in list",
            len(amounts) >= MIN_PETTY_AMOUNT_VARIANTS,
            f"unique_amounts={len(amounts)}",
        )
    except Exception as e:
        record("petty cash amounts vary in list", False, str(e))

    # Submit positive petty cash
    wf_id = None
    try:
        orig_tok = tokens[ORIGINATOR]["access_token"]
        wf_id = _petty_workflow_id(client, tokens[ORIGINATOR])
        status, inst = client.request(
            "POST",
            f"/workflows/{wf_id}/submit",
            token=orig_tok,
            body={
                "data": {
                    "amount": 432.1,
                    "purpose": "integration deep test",
                    "department": "ops",
                }
            },
            expect=201,
        )
        rid = str(inst.get("id")) if isinstance(inst, dict) else ""
        record("submit petty cash positive amount", status == 201 and bool(rid), f"id={rid}")
    except Exception as e:
        record("submit petty cash positive amount", False, str(e))
        rid = ""

    # Negative amount rejected
    try:
        if not wf_id:
            wf_id = _petty_workflow_id(client, tokens[ORIGINATOR])
        status, err = client.request(
            "POST",
            f"/workflows/{wf_id}/submit",
            token=tokens[ORIGINATOR]["access_token"],
            body={
                "data": {
                    "amount": -1,
                    "purpose": "should fail",
                    "department": "ops",
                }
            },
            expect=400,
        )
        detail = err.get("detail") if isinstance(err, dict) else err
        ok = status == 400 and "non-negative" in str(detail).lower()
        record("reject negative petty cash amount", ok, str(detail)[:80])
    except Exception as e:
        record("reject negative petty cash amount", False, str(e))

    # Approve flow: item leaves approver1 inbox, appears elsewhere
    try:
        if not wf_id:
            wf_id = _petty_workflow_id(client, tokens[ORIGINATOR])
        _, inst = client.request(
            "POST",
            f"/workflows/{wf_id}/submit",
            token=tokens[ORIGINATOR]["access_token"],
            body={
                "data": {
                    "amount": 888.88,
                    "purpose": "approve flow integration",
                    "department": "ops",
                }
            },
            expect=201,
        )
        rid = str(inst["id"])
        _, inbox_before = client.request("GET", "/inbox", token=tokens[APPROVER1]["access_token"], expect=200)
        ids_before = {str(i["request_id"]) for i in inbox_before}
        assert rid in ids_before, "new request not in approver1 inbox"

        client.request(
            "POST",
            f"/requests/{rid}/approve",
            token=tokens[APPROVER1]["access_token"],
            body={},
            expect=200,
        )
        _, inbox_after_a1 = client.request("GET", "/inbox", token=tokens[APPROVER1]["access_token"], expect=200)
        still_a1 = any(str(i["request_id"]) == rid for i in inbox_after_a1)
        _, inbox_admin = client.request("GET", "/inbox", token=tokens[ADMIN]["access_token"], expect=200)
        on_admin = any(str(i["request_id"]) == rid for i in inbox_admin)
        ok = (not still_a1) and on_admin
        record(
            "approve advances to next inbox",
            ok,
            f"still_approver1={still_a1} on_admin={on_admin}",
        )
    except Exception as e:
        record("approve advances to next inbox", False, str(e))

    return results


def main() -> int:
    base = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BASE
    print(f"WizFlow integration deep tests @ {base}\n")
    results = run(base)
    passed = sum(1 for r in results if r.ok)
    failed = len(results) - passed
    for r in results:
        mark = "PASS" if r.ok else "FAIL"
        line = f"[{mark}] {r.name}"
        if r.detail:
            line += f" — {r.detail}"
        print(line)
    print(f"\n{passed}/{len(results)} passed, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
