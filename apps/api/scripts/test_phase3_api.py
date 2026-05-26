"""Phase 3 integration tests (TestClient). Run: python -m scripts.test_phase3_api"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
PASS = "changeme"
EMAIL = "admin@demo.wizflow.biz"


def _token() -> str:
    r = client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASS})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def main() -> None:
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}

    me = client.get("/api/v1/auth/me", headers=headers).json()
    admin_id = me["id"]

    logs = client.get("/api/v1/admin/integrations/security-logs", headers=headers)
    assert logs.status_code == 200
    assert any(x["action"] == "auth.login_success" for x in logs.json())

    created = client.post(
        "/api/v1/admin/integrations/api-keys",
        headers=headers,
        json={
            "name": "Phase3 test key",
            "service_user_id": admin_id,
            "scopes": ["requests:read", "requests:write"],
        },
    )
    assert created.status_code == 201, created.text
    key_body = created.json()
    api_key = key_body["api_key"]
    key_id = key_body["id"]

    ext_headers = {"X-API-Key": api_key}
    ext_list = client.get("/api/v1/external/requests?limit=5", headers=ext_headers)
    assert ext_list.status_code == 200

    wh = client.post(
        "/api/v1/admin/integrations/webhooks",
        headers=headers,
        json={
            "name": "Test hook",
            "url": "https://httpbin.org/post",
            "events": ["request.submitted"],
        },
    )
    assert wh.status_code == 201, wh.text
    webhook_id = wh.json()["id"]

    ocr = client.post(
        "/api/v1/documents/extract",
        headers=headers,
        files={"file": ("invoice.txt", b"Invoice # INV-99 Total: 12500.00 dated 01/15/2026", "text/plain")},
        data={"doc_type": "invoice"},
    )
    assert ocr.status_code == 200, ocr.text
    ocr_body = ocr.json()
    assert ocr_body["document_type"] == "invoice"
    assert ocr_body["fields"]

    anom = client.get("/api/v1/analytics/anomalies", headers=headers)
    assert anom.status_code == 200
    assert "findings" in anom.json()

    narr = client.get("/api/v1/analytics/narrative", headers=headers)
    assert narr.status_code == 200
    assert narr.json().get("narrative")

    client.delete(f"/api/v1/admin/integrations/api-keys/{key_id}", headers=headers)
    client.delete(f"/api/v1/admin/integrations/webhooks/{webhook_id}", headers=headers)

    print("All Phase 3 API tests passed.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FAILED: {e}", file=sys.stderr)
        sys.exit(1)
