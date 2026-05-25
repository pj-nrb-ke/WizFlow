"""Execute TEST-REQUEST-REFERENCE.md cases and print results as JSON.

Run: docker compose exec api python -m scripts.run_reference_test_cases
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.db.models import WorkflowDefinition, WorkflowInstance
from app.main import app

PASSWORD = "changeme"
HTTP = TestClient(app)

RESULTS: dict[str, dict] = {}


def record(case_id: str, passed: bool | None, notes: str = "") -> None:
    if passed is None:
        RESULTS[case_id] = {"result": "SKIP", "notes": notes}
    else:
        RESULTS[case_id] = {"result": "PASS" if passed else "FAIL", "notes": notes}


def login(email: str) -> dict | None:
    r = HTTP.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    if r.status_code != 200:
        return None
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def find_workflow(headers: dict, name_contains: str) -> dict | None:
    r = HTTP.get("/api/v1/workflows?status=published", headers=headers)
    if r.status_code != 200:
        return None
    for w in r.json():
        if name_contains.lower() in w["name"].lower():
            return w
    return None


def main() -> None:
    orig = login("originator@demo.wizflow.biz")
    admin = login("admin@demo.wizflow.biz")
    if not orig or not admin:
        print(json.dumps({"error": "login failed", "results": RESULTS}))
        sys.exit(1)

    petty = find_workflow(orig, "Petty")
    purchase = find_workflow(orig, "Purchase")
    leave = find_workflow(orig, "Leave")

    # REF-01, REF-02, REF-05
    ref1 = ref2 = None
    req_id = None
    if petty:
        sub = HTTP.post(
            f"/api/v1/workflows/{petty['id']}/submit",
            headers=orig,
            json={"data": {"amount": 111, "purpose": "TC REF-01", "department": "IT"}},
            timeout=15.0,
        )
        if sub.status_code == 201:
            body = sub.json()
            ref1 = body.get("reference_number")
            req_id = body.get("id")
            record("REF-01", bool(ref1 and re.match(r"PC-\d{4}-\d{5}", ref1)), ref1 or "")
            record("REF-02", bool(ref1), "present in submit response" if ref1 else "missing")
            sub2 = HTTP.post(
                f"/api/v1/workflows/{petty['id']}/submit",
                headers=orig,
                json={"data": {"amount": 112, "purpose": "TC REF-05", "department": "IT"}},
                timeout=15.0,
            )
            if sub2.status_code == 201:
                ref2 = sub2.json().get("reference_number")
                inc = ref1 and ref2 and int(ref2.split("-")[-1]) > int(ref1.split("-")[-1])
                record("REF-05", inc, f"{ref1} -> {ref2}")
            else:
                record("REF-05", False, sub2.text[:80])
        else:
            record("REF-01", False, sub.text[:80])
            record("REF-02", False, "submit failed")
            record("REF-05", False, "submit failed")
    else:
        for c in ("REF-01", "REF-02", "REF-05"):
            record(c, False, "Petty Cash workflow not found")

    # REF-03
    if purchase:
        sub = HTTP.post(
            f"/api/v1/workflows/{purchase['id']}/submit",
            headers=orig,
            json={
                "data": {
                    "amount": 200,
                    "item_description": "TC",
                    "vendor": "V",
                    "department": "IT",
                }
            },
            timeout=15.0,
        )
        if sub.status_code == 201:
            ref = sub.json().get("reference_number", "")
            record("REF-03", ref.startswith("PR-"), ref)
        else:
            record("REF-03", False, sub.text[:80])
    else:
        record("REF-03", False, "Purchase workflow not found")

    # REF-04
    if leave:
        sub = HTTP.post(
            f"/api/v1/workflows/{leave['id']}/submit",
            headers=orig,
            json={
                "data": {
                    "leave_type": "Annual",
                    "start_date": "2026-07-01",
                    "end_date": "2026-07-05",
                    "reason": "TC REF-04",
                }
            },
            timeout=15.0,
        )
        if sub.status_code == 201:
            ref = sub.json().get("reference_number", "")
            record("REF-04", ref.startswith("LV-"), ref)
        else:
            record("REF-04", False, sub.text[:80])
    else:
        record("REF-04", False, "Leave workflow not found")

    # REF-06 — use request from REF-01
    if ref1 and req_id:
        appr = HTTP.post(
            f"/api/v1/requests/{req_id}/approve",
            headers=admin,
            json={"comment": "TC REF-06"},
            timeout=15.0,
        )
        ok = appr.status_code == 200 and appr.json().get("reference_number") == ref1
        record("REF-06", ok, f"after approve: {appr.json().get('reference_number')}")
    else:
        record("REF-06", False, "no petty ref / req_id")

    # REF-07 — skip if no returned flow easily; try DB or skip
    record("REF-07", None, "Manual: return → resubmit path not automated")

    # REF-08 — all instances should have reference after backfill
    db = SessionLocal()
    try:
        null_count = db.scalar(
            select(func.count()).select_from(WorkflowInstance).where(
                WorkflowInstance.reference_number.is_(None),
                WorkflowInstance.submitted_at.isnot(None),
            )
        )
        record("REF-08", null_count == 0, f"submitted without ref: {null_count}")
    finally:
        db.close()

    # API-01
    inbox = HTTP.get(f"/api/v1/inbox", headers=admin)
    if inbox.status_code == 200 and inbox.json():
        has = all("reference_number" in i for i in inbox.json())
        nonempty = sum(1 for i in inbox.json() if i.get("reference_number"))
        record("API-01", has, f"{nonempty}/{len(inbox.json())} with ref")
    else:
        record("API-01", False, str(inbox.status_code))

    # API-02
    if req_id:
        det = HTTP.get(f"/api/v1/requests/{req_id}", headers=admin)
        d = det.json() if det.status_code == 200 else {}
        record(
            "API-02",
            det.status_code == 200
            and d.get("reference_number")
            and d.get("submitted_at")
            and d.get("created_at"),
            str(d.get("reference_number")),
        )
    else:
        record("API-02", False, "no req_id")

    # API-03
    my = HTTP.get(f"/api/v1/requests", headers=orig)
    if my.status_code == 200 and my.json():
        record("API-03", all("reference_number" in r for r in my.json()), f"count={len(my.json())}")
    else:
        record("API-03", False, str(my.status_code))

    # API-04 claim — Fee Note if exists
    fee = find_workflow(orig, "Fee Note")
    record("API-04", None, "Manual: claim flow requires Fee Note + acc1/acc2")

    # EVT-01..04
    if req_id:
        ev = HTTP.get(f"/api/v1/requests/{req_id}/events", headers=admin)
        events = ev.json() if ev.status_code == 200 else []
        submitted = [e for e in events if e["event_type"] == "request.submitted"]
        record(
            "EVT-01",
            bool(submitted and submitted[0].get("event_label") and submitted[0].get("created_at")),
            submitted[0].get("event_label") if submitted else "",
        )
        approved = [e for e in events if e["event_type"] == "step.approved"]
        record("EVT-02", bool(approved), f"count={len(approved)}")
        record("EVT-03", all(e.get("event_label") for e in events), "")
        has_ref = any((e.get("payload") or {}).get("reference_number") for e in events)
        record("EVT-04", has_ref, "")
    else:
        for c in ("EVT-01", "EVT-02", "EVT-03", "EVT-04"):
            record(c, False, "no req_id")

    # MIS-01..04
    mis = HTTP.get(
        f"/api/v1/reports/mis/actions",
        headers=admin,
        params={"from": "2020-01-01T00:00:00Z"},
        timeout=30.0,
    )
    if mis.status_code == 200 and mis.json():
        row = mis.json()[0]
        record(
            "MIS-01",
            "reference_number" in row and "action_at" in row and "event_label" in row,
            f"rows={len(mis.json())}",
        )
        if ref1:
            appr_row = any(
                r.get("reference_number") == ref1 and "approved" in (r.get("event_label") or "").lower()
                for r in mis.json()
            )
            record("MIS-04", appr_row, "")
        else:
            record("MIS-04", False, "no ref1")
    else:
        record("MIS-01", False, mis.text[:80] if mis.status_code != 200 else "empty")
        record("MIS-04", False, "")

    csv = HTTP.get(f"/api/v1/reports/mis/actions.csv", headers=admin)
    record(
        "MIS-02",
        csv.status_code == 200 and "reference_number" in csv.text and "action_at" in csv.text,
        f"bytes={len(csv.text)}",
    )

    mis_orig = HTTP.get(f"/api/v1/reports/mis/actions", headers=orig)
    record("MIS-03", mis_orig.status_code == 403, f"status={mis_orig.status_code}")

    # UI manual
    for c in ("UI-01", "UI-02", "UI-03", "UI-04"):
        record(c, None, "Manual browser verification required")

    print(json.dumps({"run_at": datetime.now(timezone.utc).isoformat(), "results": RESULTS}, indent=2))


if __name__ == "__main__":
    main()
