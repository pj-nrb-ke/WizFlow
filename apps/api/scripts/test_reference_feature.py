"""Manual QA script for reference numbers + MIS export."""

import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BASE = "http://127.0.0.1:8000"


def login(email: str) -> dict:
    r = httpx.post(f"{BASE}/api/v1/auth/login", json={"email": email, "password": "changeme"})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def main() -> None:
    orig = login("originator@demo.wizflow.biz")
    admin = login("admin@demo.wizflow.biz")

    wfs = httpx.get(f"{BASE}/api/v1/workflows?status=published", headers=orig).json()
    petty = next(w for w in wfs if "Petty" in w["name"])
    leave = next((w for w in wfs if "Leave" in w["name"]), None)

    sub1 = httpx.post(
        f"{BASE}/api/v1/workflows/{petty['id']}/submit",
        headers=orig,
        json={"data": {"amount": 750, "purpose": "QA ref test A", "department": "IT"}},
    )
    sub1.raise_for_status()
    d1 = sub1.json()
    print("1. Petty submit:", d1["reference_number"], d1["submitted_at"])

    if leave:
        sub2 = httpx.post(
            f"{BASE}/api/v1/workflows/{leave['id']}/submit",
            headers=orig,
            json={"data": {"start_date": "2026-06-01", "end_date": "2026-06-05", "reason": "QA"}},
        )
        if sub2.status_code == 201:
            print("2. Leave submit:", sub2.json().get("reference_number"))
        else:
            print("2. Leave submit skipped:", sub2.status_code, sub2.text[:120])

    inbox = httpx.get(f"{BASE}/api/v1/inbox", headers=admin).json()
    match = next((i for i in inbox if i.get("reference_number") == d1["reference_number"]), None)
    print("3. Inbox lists ref:", bool(match), "total inbox:", len(inbox))

    req = httpx.get(f"{BASE}/api/v1/requests/{d1['id']}", headers=admin).json()
    print("4. Detail ref:", req["reference_number"], "can_act:", req.get("can_act"))

    events = httpx.get(f"{BASE}/api/v1/requests/{d1['id']}/events", headers=admin).json()
    print("5. Events:", len(events), "first:", events[0]["event_label"], events[0]["created_at"])

    appr = httpx.post(
        f"{BASE}/api/v1/requests/{d1['id']}/approve",
        headers=admin,
        json={"comment": "QA approve"},
    )
    print("6. Approve:", appr.status_code, appr.json().get("status"), appr.json().get("reference_number"))

    events2 = httpx.get(f"{BASE}/api/v1/requests/{d1['id']}/events", headers=admin).json()
    types = [e["event_type"] for e in events2]
    print("7. Timeline after approve:", types)

    mis = httpx.get(f"{BASE}/api/v1/reports/mis/actions", headers=admin, params={"from": "2020-01-01"})
    print("8. MIS rows (sample):", mis.status_code, "count>=", len(mis.json()) if mis.status_code == 200 else 0)
    if mis.status_code == 200 and mis.json():
        row = next((r for r in mis.json() if r.get("reference_number") == d1["reference_number"]), None)
        if row:
            print("   Sample row:", row["event_label"], row["action_at"], row.get("comment"))

    csv = httpx.get(f"{BASE}/api/v1/reports/mis/actions.csv", headers=admin)
    print("9. CSV export:", csv.status_code, "bytes:", len(csv.text), "has PC-", "PC-" in csv.text)

    my = httpx.get(f"{BASE}/api/v1/requests", headers=orig).json()
    refs = [r.get("reference_number") for r in my[:5]]
    print("10. My requests refs (top 5):", refs)


if __name__ == "__main__":
    main()
