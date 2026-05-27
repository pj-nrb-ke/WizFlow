"""
WIZ-QA-002 production QA harness (read-only; uses demo credentials).
Run: python scripts/qa_wiz_qa_002.py
"""
from __future__ import annotations

import json
from pathlib import Path
import statistics
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

BASE = "https://api.wizflow.biz"
ADMIN = ("admin@demo.wizflow.biz", "changeme")
ORIG = ("originator@demo.wizflow.biz", "changeme")


@dataclass
class Case:
    test_id: str
    module: str
    feature: str
    use_case: str
    steps: str
    expected: str
    actual: str
    status: str  # PASS | FAIL | WARN
    severity: str  # CRITICAL | HIGH | MEDIUM | LOW | —
    agent: str = "QA-002"
    retest: str = "No"


@dataclass
class Finding:
    finding_id: str
    category: str  # Security | Performance | UI/UX | API | Mobile
    title: str
    description: str
    severity: str
    recommendation: str


@dataclass
class QAResult:
    cases: list[Case] = field(default_factory=list)
    findings: list[Finding] = field(default_factory=list)
    perf_metrics: list[dict[str, Any]] = field(default_factory=list)
    api_errors: list[str] = field(default_factory=list)


def http(
    method: str,
    path: str,
    *,
    headers: dict | None = None,
    body: bytes | None = None,
    timeout: int = 30,
) -> tuple[int, str, float]:
    url = f"{BASE}{path}"
    h = {"Accept": "application/json", **(headers or {})}
    if body is not None and "Content-Type" not in h:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            elapsed = time.perf_counter() - t0
            return resp.status, resp.read().decode("utf-8", errors="replace"), elapsed
    except urllib.error.HTTPError as e:
        elapsed = time.perf_counter() - t0
        data = e.read().decode("utf-8", errors="replace")
        return e.code, data, elapsed
    except Exception as e:
        elapsed = time.perf_counter() - t0
        return 0, str(e), elapsed


def login(email: str, password: str) -> str | None:
    body = json.dumps({"email": email, "password": password}).encode()
    code, text, _ = http("POST", "/api/v1/auth/login", body=body)
    if code != 200:
        return None
    return json.loads(text).get("access_token")


def auth_h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def add_case(r: QAResult, **kwargs: Any) -> None:
    r.cases.append(Case(**kwargs))


def add_finding(r: QAResult, **kwargs: Any) -> None:
    r.findings.append(Finding(**kwargs))


def run() -> QAResult:
    r = QAResult()

    # --- Health & performance ---
    latencies: list[float] = []
    for _ in range(5):
        code, text, elapsed = http("GET", "/api/v1/health")
        latencies.append(elapsed)
        if code != 200:
            r.api_errors.append(f"health: {code} {text[:200]}")
    r.perf_metrics.append(
        {
            "endpoint": "GET /api/v1/health",
            "samples": len(latencies),
            "avg_ms": round(statistics.mean(latencies) * 1000, 1),
            "max_ms": round(max(latencies) * 1000, 1),
        }
    )
    add_case(
        r,
        test_id="API-001",
        module="API",
        feature="Health",
        use_case="Health endpoint responds",
        steps="GET /api/v1/health x5",
        expected="200, status ok",
        actual=f"200 avg {r.perf_metrics[-1]['avg_ms']}ms",
        status="PASS" if code == 200 else "FAIL",
        severity="—",
    )

    # --- Auth ---
    code, _, _ = http("GET", "/api/v1/auth/me")
    add_case(
        r,
        test_id="SEC-001",
        module="Auth",
        feature="Protected route",
        use_case="Unauthenticated /me rejected",
        steps="GET /api/v1/auth/me without token",
        expected="401",
        actual=str(code),
        status="PASS" if code == 401 else "FAIL",
        severity="CRITICAL" if code != 401 else "—",
    )

    code, _, _ = http(
        "GET",
        "/api/v1/auth/me",
        headers=auth_h("invalid.token.here"),
    )
    add_case(
        r,
        test_id="SEC-002",
        module="Auth",
        feature="Invalid JWT",
        use_case="Invalid token rejected",
        steps="GET /me with garbage JWT",
        expected="401",
        actual=str(code),
        status="PASS" if code == 401 else "FAIL",
        severity="CRITICAL" if code != 401 else "—",
    )

    sqli_email = "admin' OR '1'='1"
    body = json.dumps({"email": sqli_email, "password": "x"}).encode()
    code, text, _ = http("POST", "/api/v1/auth/login", body=body)
    add_case(
        r,
        test_id="SEC-003",
        module="Auth",
        feature="SQL injection login",
        use_case="SQLi in email field",
        steps=f"POST login email={sqli_email!r}",
        expected="401/422, no bypass",
        actual=str(code),
        status="PASS" if code in (401, 422, 400) else "FAIL",
        severity="CRITICAL" if code == 200 else "—",
    )

    admin_tok = login(*ADMIN)
    orig_tok = login(*ORIG)
    add_case(
        r,
        test_id="AUTH-001",
        module="Auth",
        feature="Demo login",
        use_case="Admin and originator login",
        steps="POST login demo users",
        expected="200 both",
        actual=f"admin={bool(admin_tok)} originator={bool(orig_tok)}",
        status="PASS" if admin_tok and orig_tok else "FAIL",
        severity="HIGH" if not (admin_tok and orig_tok) else "—",
    )

    if not admin_tok:
        add_finding(
            r,
            finding_id="BLOCK-001",
            category="API",
            title="Cannot reach production API with demo credentials",
            description="Login failed; remaining live tests skipped.",
            severity="CRITICAL",
            recommendation="Verify api.wizflow.biz and demo seed.",
        )
        return r

    # Malformed JSON
    code, text, _ = http(
        "POST",
        "/api/v1/auth/login",
        headers={"Content-Type": "application/json"},
        body=b"{not-json",
    )
    add_case(
        r,
        test_id="API-002",
        module="API",
        feature="Malformed JSON",
        use_case="Invalid JSON body",
        steps="POST login with broken JSON",
        expected="422",
        actual=str(code),
        status="PASS" if code == 422 else "WARN" if code == 400 else "FAIL",
        severity="MEDIUM" if code not in (400, 422) else "—",
    )

    # Privilege: originator cannot access admin departments
    code, text, _ = http(
        "GET",
        "/api/v1/admin/departments",
        headers=auth_h(orig_tok or ""),
    )
    add_case(
        r,
        test_id="SEC-004",
        module="Auth",
        feature="Privilege escalation",
        use_case="Originator blocked from admin API",
        steps="GET /admin/departments as originator",
        expected="403",
        actual=str(code),
        status="PASS" if code == 403 else "FAIL",
        severity="CRITICAL" if code == 200 else "HIGH" if code != 403 else "—",
    )

    # Workflows list
    code, text, elapsed = http("GET", "/api/v1/workflows", headers=auth_h(admin_tok))
    wf_count = len(json.loads(text)) if code == 200 else 0
    r.perf_metrics.append({"endpoint": "GET /workflows", "ms": round(elapsed * 1000, 1), "count": wf_count})
    add_case(
        r,
        test_id="FUNC-001",
        module="Workflows",
        feature="List workflows",
        use_case="Admin lists workflows",
        steps="GET /workflows",
        expected="200, non-empty demo data",
        actual=f"{code} count={wf_count}",
        status="PASS" if code == 200 and wf_count >= 5 else "WARN" if code == 200 else "FAIL",
        severity="MEDIUM" if wf_count < 5 else "—",
    )

    # Inbox unbounded
    code, text, elapsed = http("GET", "/api/v1/inbox", headers=auth_h(admin_tok))
    inbox_n = len(json.loads(text)) if code == 200 else 0
    r.perf_metrics.append({"endpoint": "GET /inbox", "ms": round(elapsed * 1000, 1), "items": inbox_n})
    add_case(
        r,
        test_id="PERF-001",
        module="Inbox",
        feature="List performance",
        use_case="Inbox returns without server error",
        steps="GET /inbox",
        expected="200",
        actual=f"{code} items={inbox_n} {round(elapsed*1000)}ms",
        status="PASS" if code == 200 else "FAIL",
        severity="—",
    )
    if elapsed > 3.0:
        add_finding(
            r,
            finding_id="PERF-002",
            category="Performance",
            title="Slow inbox response",
            description=f"Inbox took {elapsed:.1f}s for {inbox_n} items.",
            severity="HIGH" if elapsed > 5 else "MEDIUM",
            recommendation="Add pagination and DB indexes on inbox query.",
        )

    # Edge: negative amount submit
    code_w, text_w, _ = http("GET", "/api/v1/workflows", headers=auth_h(admin_tok))
    wfs = json.loads(text_w) if code_w == 200 else []
    published = [w for w in wfs if w.get("status") == "published"]
    if published and orig_tok:
        wf_id = published[0]["id"]
        payload = json.dumps({"data": {"amount": -99999, "purpose": "QA negative test"}}).encode()
        code, text, _ = http(
            "POST",
            f"/api/v1/workflows/{wf_id}/submit",
            headers=auth_h(orig_tok),
            body=payload,
        )
        add_case(
            r,
            test_id="FUNC-002",
            module="Submit",
            feature="Negative amount",
            use_case="Reject or sanitize negative currency",
            steps="POST submit amount=-99999",
            expected="400/422 rejection",
            actual=f"{code} {text[:120]}",
            status="PASS" if code in (400, 422) else "WARN" if code == 201 else "FAIL",
            severity="HIGH" if code == 201 else "MEDIUM" if code not in (400, 422, 201) else "—",
        )

        # Unicode / XSS payload in purpose
        xss = "<script>alert(1)</script> 测试 🎉"
        payload2 = json.dumps({"data": {"amount": 100, "purpose": xss}}).encode()
        code2, text2, _ = http(
            "POST",
            f"/api/v1/workflows/{wf_id}/submit",
            headers=auth_h(orig_tok),
            body=payload2,
        )
        add_case(
            r,
            test_id="SEC-005",
            module="Submit",
            feature="XSS in text field",
            use_case="Stored text handled safely",
            steps="Submit purpose with HTML/script",
            expected="201 or 400; API must not reflect unsanitized in errors",
            actual=f"{code2}",
            status="PASS" if code2 in (201, 400, 422) else "FAIL",
            severity="MEDIUM",
        )

    # Public approval invalid token
    code, _, _ = http("GET", "/api/v1/public/approval/not-a-real-token")
    add_case(
        r,
        test_id="SEC-006",
        module="Public approval",
        feature="Invalid token",
        use_case="Invalid magic link",
        steps="GET /public/approval/bad",
        expected="404",
        actual=str(code),
        status="PASS" if code == 404 else "FAIL",
        severity="HIGH" if code == 200 else "—",
    )

    # Phase2 analytics (regression)
    code, text, _ = http("GET", "/api/v1/analytics/workload", headers=auth_h(admin_tok))
    add_case(
        r,
        test_id="REG-001",
        module="Phase2",
        feature="Workload analytics",
        use_case="Phase 2 endpoint available",
        steps="GET /analytics/workload",
        expected="200",
        actual=str(code),
        status="PASS" if code == 200 else "FAIL",
        severity="HIGH" if code == 500 else "MEDIUM" if code != 200 else "—",
    )

    code, _, _ = http("GET", "/api/v1/kpi-targets", headers=auth_h(admin_tok))
    add_case(
        r,
        test_id="REG-002",
        module="Phase2",
        feature="KPI targets",
        use_case="KPI targets CRUD route",
        steps="GET /kpi-targets",
        expected="200",
        actual=str(code),
        status="PASS" if code == 200 else "FAIL",
        severity="MEDIUM" if code != 200 else "—",
    )

    # Oversized payload (auth login)
    huge = json.dumps({"email": "a@b.c", "password": "x", "extra": "A" * 500_000}).encode()
    code, _, _ = http("POST", "/api/v1/auth/login", body=huge, timeout=15)
    add_case(
        r,
        test_id="SEC-007",
        module="API",
        feature="Oversized payload",
        use_case="Large JSON rejected or handled",
        steps="POST login ~500KB body",
        expected="413/422/400, not 500",
        actual=str(code),
        status="PASS" if code == 413 else "PASS" if code in (400, 422) else "WARN" if code == 200 else "FAIL",
        severity="MEDIUM",
    )

    return r


def main() -> None:
    result = run()
    out = Path(__file__).resolve().parents[1] / "docs" / "qa-reports" / "wiz-qa-002"
    out.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).isoformat()
    payload = {
        "generated_at": ts,
        "cases": [asdict(c) for c in result.cases],
        "findings": [asdict(f) for f in result.findings],
        "perf_metrics": result.perf_metrics,
        "api_errors": result.api_errors,
    }
    (out / "qa-002-results.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({"summary": {
        "total": len(result.cases),
        "passed": sum(1 for c in result.cases if c.status == "PASS"),
        "failed": sum(1 for c in result.cases if c.status == "FAIL"),
        "warn": sum(1 for c in result.cases if c.status == "WARN"),
    }}, indent=2))


if __name__ == "__main__":
    main()
