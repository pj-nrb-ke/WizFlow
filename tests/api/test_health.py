from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root() -> None:
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["service"] == "WizFlow API"


def test_health_without_db() -> None:
    """Health endpoint exists; DB may be unavailable in CI without postgres service."""
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "version" in body
    assert body["database"] in ("ok", "unavailable")
