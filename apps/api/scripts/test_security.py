"""Security / penetration test suite for the WizFlow API.

Probes auth enforcement, JWT tampering, role gating, multi-tenant isolation
(IDOR), SQL injection, mass-assignment, body-size limit, rate limiting, public
token handling, and API-key auth. Sets up a second tenant via the ORM so
cross-tenant access can be tested for real.

Run: DATABASE_URL=postgresql://wizflow:wizflow@127.0.0.1:5466/wizflow_dev \
     python -m scripts.test_security
"""

from __future__ import annotations

import sys
import uuid

import httpx

from app.core.security import hash_password
from app.db.models import Company, Role, User, UserRole
from app.db.session import SessionLocal

BASE = "http://localhost:8010/api/v1"
ADMIN = {"email": "admin@demo.wizflow.biz", "password": "changeme"}
ORIGINATOR = {"email": "originator@demo.wizflow.biz", "password": "changeme"}
TENANT_B_EMAIL = "pentest-admin@demo.wizflow.biz"
TENANT_B_PASSWORD = "changeme"

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))
    return ok


def ensure_tenant_b() -> None:
    """Create an isolated second company + admin (idempotent)."""
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == TENANT_B_EMAIL).first()
        if existing:
            return
        company = Company(name="PenTest Co", slug=f"pentest-{uuid.uuid4().hex[:8]}")
        db.add(company)
        db.flush()
        roles = {}
        for slug in ("company_admin", "manager", "originator", "approver"):
            r = Role(company_id=company.id, slug=slug, name=slug.replace("_", " ").title())
            db.add(r)
            db.flush()
            roles[slug] = r
        admin = User(
            company_id=company.id,
            email=TENANT_B_EMAIL,
            password_hash=hash_password(TENANT_B_PASSWORD),
            full_name="PenTest Admin",
        )
        db.add(admin)
        db.flush()
        db.add(UserRole(user_id=admin.id, role_id=roles["company_admin"].id))
        db.commit()
    finally:
        db.close()


def login(c, creds) -> str | None:
    r = c.post(f"{BASE}/auth/login", json=creds)
    return r.json().get("access_token") if r.status_code == 200 else None


def main() -> int:
    ensure_tenant_b()
    c = httpx.Client(timeout=20.0)

    admin_tok = login(c, ADMIN)
    if not admin_tok:
        print("admin login failed — aborting")
        return 1
    A = {"Authorization": f"Bearer {admin_tok}"}
    b_tok = login(c, {"email": TENANT_B_EMAIL, "password": TENANT_B_PASSWORD})
    B = {"Authorization": f"Bearer {b_tok}"} if b_tok else None
    orig_tok = login(c, ORIGINATOR)
    O = {"Authorization": f"Bearer {orig_tok}"} if orig_tok else None

    # sample tenant-A resources
    wfs = c.get(f"{BASE}/workflows", headers=A).json()
    a_wid = wfs[0]["id"] if wfs else None
    reqs = c.get(f"{BASE}/requests", headers=A).json()
    a_rid = reqs[0]["id"] if reqs else None

    fresh = httpx.Client(timeout=20.0)  # no cookies/token

    # ---- 1. Auth required ----
    print("1. Authentication required")
    for path in ["/workflows", "/requests", "/admin/users", "/notifications", "/analytics/executive"]:
        r = fresh.get(f"{BASE}{path}")
        check(f"no token -> 401 {path}", r.status_code == 401, str(r.status_code))

    # ---- 2. JWT tampering ----
    print("2. JWT tampering")
    tampered = admin_tok[:-3] + ("aaa" if not admin_tok.endswith("aaa") else "bbb")
    r = fresh.get(f"{BASE}/workflows", headers={"Authorization": f"Bearer {tampered}"})
    check("tampered JWT signature -> 401", r.status_code == 401, str(r.status_code))
    r = fresh.get(f"{BASE}/workflows", headers={"Authorization": "Bearer garbage.token.value"})
    check("garbage token -> 401", r.status_code == 401, str(r.status_code))

    # ---- 3. Role gating (originator is not manager/admin) ----
    print("3. Role/privilege escalation")
    if O:
        r = c.post(f"{BASE}/workflows", headers=O, json={"name": "x", "form_schema": {"fields": []}, "steps": [], "routing_rules": [], "settings": {}})
        check("originator create workflow -> 403", r.status_code == 403, str(r.status_code))
        r = c.get(f"{BASE}/admin/users", headers=O)
        check("originator GET admin/users -> 403", r.status_code == 403, str(r.status_code))
        r = c.post(f"{BASE}/ai/workflow/draft", headers=O, json={"description": "leave workflow please"})
        check("originator AI draft -> 403", r.status_code == 403, str(r.status_code))
        if a_wid:
            r = c.post(f"{BASE}/workflows/{a_wid}/clone", headers=O)
            check("originator clone workflow -> 403", r.status_code == 403, str(r.status_code))
    else:
        check("originator login available", False, "could not login originator")

    # ---- 4. Multi-tenant isolation (IDOR) ----
    print("4. Multi-tenant isolation (IDOR)")
    if B and a_wid:
        r = c.get(f"{BASE}/workflows/{a_wid}", headers=B)
        check("tenant B reads tenant A workflow -> 404", r.status_code == 404, str(r.status_code))
        r = c.get(f"{BASE}/workflows/{a_wid}/preview", headers=B)
        check("tenant B preview tenant A workflow -> 404", r.status_code == 404, str(r.status_code))
        r = c.post(f"{BASE}/workflows/{a_wid}/clone", headers=B)
        check("tenant B clones tenant A workflow -> 404", r.status_code == 404, str(r.status_code))
        blist = c.get(f"{BASE}/workflows", headers=B).json()
        check("tenant B list excludes tenant A ids", all(w["id"] != a_wid for w in blist), f"B sees {len(blist)} workflows")
    if B and a_rid:
        r = c.get(f"{BASE}/requests/{a_rid}", headers=B)
        check("tenant B reads tenant A request -> 404", r.status_code == 404, str(r.status_code))
        r = c.post(f"{BASE}/requests/{a_rid}/approve", headers=B, json={"comment": "x"})
        check("tenant B approves tenant A request -> 4xx", 400 <= r.status_code < 500, str(r.status_code))

    # ---- 5. SQL injection ----
    print("5. SQL injection")
    payloads = ["' OR '1'='1", "'; DROP TABLE users;--", "' UNION SELECT password_hash FROM users--", "\" OR \"\"=\"", "1) OR (1=1"]
    sqli_ok = True
    for p in payloads:
        r = c.get(f"{BASE}/requests", headers=A, params={"q": p})
        if r.status_code >= 500:
            sqli_ok = False
        r2 = c.get(f"{BASE}/inbox", headers=A, params={"q": p, "department": p})
        if r2.status_code >= 500:
            sqli_ok = False
        r3 = c.get(f"{BASE}/workflows/check-name", headers=A, params={"name": p})
        if r3.status_code >= 500:
            sqli_ok = False
    check("SQLi payloads never cause 5xx (parameterized)", sqli_ok)
    # verify the destructive payload did NOT execute — users table still queryable
    still = c.get(f"{BASE}/admin/users", headers=A)
    check("users table intact after DROP TABLE payload", still.status_code == 200 and len(still.json()) > 0, str(still.status_code))
    # OR 1=1 in search must not bypass the company filter / return foreign rows
    inj = c.get(f"{BASE}/requests", headers=A, params={"q": "' OR '1'='1"})
    check("OR-1=1 search returns a JSON list (treated as literal)", inj.status_code == 200 and isinstance(inj.json(), list), str(inj.status_code))

    # ---- 6. Path param injection ----
    print("6. Path param injection")
    r = c.get(f"{BASE}/workflows/' OR 1=1--", headers=A)
    check("non-UUID path -> 422 (not 500)", r.status_code == 422, str(r.status_code))

    # ---- 7. Mass assignment ----
    print("7. Mass assignment")
    if B:
        b_company = c.get(f"{BASE}/auth/me", headers=B).json().get("company_id")
        mass = c.post(f"{BASE}/workflows", headers=A, json={
            "name": f"Mass {uuid.uuid4().hex[:6]}", "form_schema": {"fields": [{"key": "a", "type": "text", "label": "A"}]},
            "steps": [{"id": "s1", "name": "S1", "type": "approval", "assignee": {"type": "role", "value": "manager"}}],
            "routing_rules": [], "settings": {},
            "company_id": b_company, "status": "published", "id": str(uuid.uuid4()),
        })
        if mass.status_code in (200, 201):
            j = mass.json()
            check("created workflow ignores injected status (stays draft)", j.get("status") == "draft", j.get("status", "?"))
            # must not be visible to tenant B (company_id ignored)
            bl = c.get(f"{BASE}/workflows", headers=B).json()
            check("injected company_id ignored (not in tenant B)", all(w["name"] != j["name"] for w in bl))
        else:
            check("mass-assignment create", False, str(mass.status_code))

    # ---- 8. Body size limit ----
    print("8. Body size limit")
    big = fresh.post(f"{BASE}/auth/login", content=b'{"email":"a@b.c","password":"' + b"x" * 2_000_000 + b'"}', headers={"Content-Type": "application/json"})
    check("oversized body -> 413", big.status_code == 413, str(big.status_code))

    # ---- 9. Rate limiting (informational) ----
    print("9. Rate limiting on login")
    codes = [fresh.post(f"{BASE}/auth/login", json={"email": "x@y.z", "password": "nope"}).status_code for _ in range(35)]
    check("login rate-limited after burst (429 seen)", 429 in codes, f"codes seen: {sorted(set(codes))}")

    # ---- 10. Public token + external API key ----
    print("10. Public token / external API")
    r = fresh.get(f"{BASE}/public/approval/{uuid.uuid4()}")
    check("invalid public approval token -> 4xx not 5xx", 400 <= r.status_code < 500, str(r.status_code))
    r = fresh.get(f"{BASE}/external/requests")
    check("external API without key -> 401/403", r.status_code in (401, 403), str(r.status_code))

    return summarize()


def summarize() -> int:
    failed = [r for r in results if not r[1]]
    print("\n" + "=" * 60)
    print(f"RESULT: {len(results) - len(failed)}/{len(results)} passed, {len(failed)} failed")
    if failed:
        print("FAILURES (review — may be real vulnerabilities):")
        for name, _, detail in failed:
            print(f"  - {name}: {detail}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
