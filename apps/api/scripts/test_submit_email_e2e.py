"""Submit a request to trigger real approval emails."""

import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BASE = "http://127.0.0.1:8000"


def login(email: str) -> str:
    r = httpx.post(f"{BASE}/api/v1/auth/login", json={"email": email, "password": "changeme"})
    r.raise_for_status()
    return r.json()["access_token"]


def main() -> None:
    orig = login("originator@demo.wizflow.biz")
    h = {"Authorization": f"Bearer {orig}"}
    wfs = httpx.get(f"{BASE}/api/v1/workflows?status=published", headers=h).json()
    petty = next(w for w in wfs if "Petty" in w["name"])
    sub = httpx.post(
        f"{BASE}/api/v1/workflows/{petty['id']}/submit",
        headers=h,
        json={"data": {"amount": 500, "purpose": "Email E2E test", "department": "IT"}},
    )
    sub.raise_for_status()
    data = sub.json()
    print("Submitted:", data["id"], "status:", data["status"])
    print("Notified assignees:", [a.get("email") for a in data.get("assignees", [])])


if __name__ == "__main__":
    main()
