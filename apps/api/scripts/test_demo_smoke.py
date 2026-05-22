"""Smoke-test demo seed via API. Run inside API container: python -m scripts.test_demo_smoke"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

FINDINGS: list[str] = []


def login(email: str, password: str = "changeme") -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def main() -> int:
    admin_h = login("admin@demo.wizflow.biz")
    orig_h = login("originator@demo.wizflow.biz")
    orig2_h = login("originator2@demo.wizflow.biz")

    wfs = client.get("/api/v1/workflows", headers=admin_h).json()
    published = [w for w in wfs if w["status"] == "published"]
    drafts = [w for w in wfs if w["status"] == "draft"]
    FINDINGS.append(f"Workflows total={len(wfs)} published={len(published)} draft={len(drafts)}")
    if len(wfs) < 12:
        FINDINGS.append(f"WARN: expected >=12 workflows, got {len(wfs)}")

    inbox = client.get("/api/v1/inbox", headers=admin_h).json()
    FINDINGS.append(f"Admin inbox items={len(inbox)}")
    if len(inbox) < 5:
        FINDINGS.append(f"WARN: expected rich inbox, got {len(inbox)}")

    reqs_admin = client.get("/api/v1/requests", headers=admin_h).json()
    reqs_orig = client.get("/api/v1/requests", headers=orig_h).json()
    reqs_orig2 = client.get("/api/v1/requests", headers=orig2_h).json()
    FINDINGS.append(f"My requests: originator={len(reqs_orig)} originator2={len(reqs_orig2)} admin_as_originator={len(reqs_admin)}")

    notifs = client.get("/api/v1/notifications", headers=admin_h).json()
    FINDINGS.append(f"Admin notifications={len(notifs)}")

    depts = client.get("/api/v1/admin/departments", headers=admin_h)
    if depts.status_code == 200:
        FINDINGS.append(f"Departments={len(depts.json())}")
    else:
        FINDINGS.append(f"WARN: departments API {depts.status_code}")

    # Approve one inbox item end-to-end
    if inbox:
        rid = inbox[0]["request_id"]
        appr = client.post(f"/api/v1/requests/{rid}/approve", headers=admin_h, json={"comment": "Smoke test OK"})
        FINDINGS.append(f"Approve inbox[0]: status={appr.status_code}")
        if appr.status_code != 200:
            FINDINGS.append(f"WARN: approve failed: {appr.text}")

    # Submit new petty cash
    petty = next((w for w in published if "Petty Cash" in w["name"]), published[0] if published else None)
    if petty:
        sub = client.post(
            f"/api/v1/workflows/{petty['id']}/submit",
            headers=orig_h,
            json={"data": {"amount": 1200, "purpose": "Smoke test supplies", "department": "IT"}},
        )
        FINDINGS.append(f"New submit: status={sub.status_code}")
        if sub.status_code != 201:
            FINDINGS.append(f"WARN: submit failed: {sub.text}")

    # Detail page for first originator request
    if reqs_orig:
        detail = client.get(f"/api/v1/requests/{reqs_orig[0]['id']}", headers=orig_h)
        events = client.get(f"/api/v1/requests/{reqs_orig[0]['id']}/events", headers=orig_h)
        FINDINGS.append(f"Request detail: {detail.status_code} events: {events.status_code} count={len(events.json()) if events.status_code == 200 else 0}")

    print("=== Demo smoke test findings ===")
    for line in FINDINGS:
        print(line)
    warns = sum(1 for f in FINDINGS if f.startswith("WARN"))
    return 1 if warns else 0


if __name__ == "__main__":
    raise SystemExit(main())
