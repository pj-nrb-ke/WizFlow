"""Route-coverage smoke test.

Introspects EVERY GET route registered on the FastAPI app, fills path params
from real seeded IDs, and calls each one against the running API. Flags any 5xx
(server error) — the class of bug that a hand-picked endpoint list misses
(e.g. the Admin /users 500). Run: python -m scripts.test_route_coverage
"""

from __future__ import annotations

import os
import re
import sys

import httpx

from app.main import app

HOST = os.environ.get("E2E_HOST", "http://localhost:8010")
BASE = f"{HOST}/api/v1"
EMAIL = os.environ.get("E2E_EMAIL", "admin@demo.wizflow.biz")
PASSWORD = os.environ.get("E2E_PASSWORD", "changeme")


def first_id(data, *keys):
    """Pull an id from a list response or a {items:[...]} response."""
    rows = data
    if isinstance(data, dict):
        for k in ("items", "results", "data", "notifications"):
            if isinstance(data.get(k), list):
                rows = data[k]
                break
    if isinstance(rows, list) and rows:
        row = rows[0]
        if isinstance(row, dict):
            for k in keys:
                if row.get(k):
                    return str(row[k])
    return None


def main() -> int:
    c = httpx.Client(timeout=30.0)
    tok = c.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if tok.status_code != 200:
        print("login failed", tok.status_code, tok.text[:200])
        return 1
    H = {"Authorization": f"Bearer {tok.json()['access_token']}"}

    def g(path):
        r = c.get(f"{BASE}{path}", headers=H)
        return r.json() if r.status_code == 200 else None

    wfs = g("/workflows") or []
    published = [w for w in wfs if isinstance(w, dict) and w.get("status") == "published"]
    params = {
        "workflow_id": first_id(wfs, "id"),
        "family_id": first_id(wfs, "family_id", "id"),
        "request_id": first_id(g("/requests"), "id"),
        "instance_id": first_id(g("/requests"), "id"),
        "id": first_id(g("/requests"), "id"),
        "group_id": first_id(g("/admin/user-groups"), "id"),
        "user_id": first_id(g("/admin/users"), "id"),
        "notification_id": first_id(g("/notifications"), "id"),
        "version": "1",
        "token": "coverage-invalid-token",
        "key_id": first_id(g("/admin/integrations/api-keys"), "id"),
        "webhook_id": first_id(g("/admin/integrations/webhooks"), "id"),
        "delegation_id": first_id(g("/delegations"), "id"),
        "view_id": first_id(g("/saved-views"), "id"),
    }
    if published:
        params["workflow_id"] = published[0]["id"]

    tested: list[tuple[str, int]] = []
    skipped: list[str] = []
    server_errors: list[tuple[str, int, str]] = []

    seen = set()
    for route in app.routes:
        methods = getattr(route, "methods", None) or set()
        path = getattr(route, "path", "")
        if "GET" not in methods or not path.startswith("/api/v1"):
            continue
        names = re.findall(r"{(\w+)}", path)
        if any(params.get(n) in (None, "") for n in names):
            skipped.append(path)
            continue
        real = path
        for n in names:
            real = real.replace("{" + n + "}", str(params[n]))
        if real in seen:
            continue
        seen.add(real)
        r = c.get(f"{HOST}{real}", headers=H)
        tested.append((real, r.status_code))
        if r.status_code >= 500:
            server_errors.append((real, r.status_code, r.text[:160]))

    print(f"GET routes tested: {len(tested)} | skipped (unfillable params): {len(skipped)}")
    print(f"Status spread: " + ", ".join(
        f"{code}:{sum(1 for _, s in tested if s == code)}"
        for code in sorted({s for _, s in tested})
    ))
    if skipped:
        print("Skipped paths:")
        for p in skipped:
            print(f"  - {p}")
    print("\n" + "=" * 60)
    if server_errors:
        print(f"SERVER ERRORS (5xx): {len(server_errors)} — MUST FIX")
        for path, code, detail in server_errors:
            print(f"  [{code}] {path} — {detail}")
        return 1
    print("No 5xx server errors across all GET routes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
