"""API logic: routing, amount validation, reference numbers."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.db.models import WorkflowDefinition
from app.main import app
from app.services import instance_engine
from app.services.workflow_engine import simulate

client = TestClient(app)
PASS = "changeme"


def login(email: str) -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": PASS})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _petty_workflow_id(headers: dict) -> str:
    wfs = client.get("/api/v1/workflows", params={"status": "published"}, headers=headers).json()
    return next(w["id"] for w in wfs if "Petty" in w["name"])


def test_simulate_routing_low_high() -> None:
    """Petty cash: amount <= 5000 skips finance step."""
    from app.db.session import SessionLocal
    from sqlalchemy import select

    db = SessionLocal()
    try:
        defn = db.scalar(
            select(WorkflowDefinition).where(WorkflowDefinition.name == "Petty Cash Approval")
        )
        assert defn, "Petty Cash workflow missing"
        low = simulate(defn, {"amount": 100, "purpose": "x", "department": "it"})
        assert low.steps_traversed == ["step_manager", "step_finance"], low.steps_traversed
        high = simulate(defn, {"amount": 6000, "purpose": "x", "department": "it"})
        assert high.steps_traversed == ["step_finance"], high.steps_traversed
        # String amounts must not crash routing
        as_str = simulate(defn, {"amount": "6000", "purpose": "x", "department": "it"})
        assert as_str.steps_traversed == ["step_finance"], as_str.steps_traversed
    finally:
        db.close()


def test_validate_form_number_fields() -> None:
    from app.db.session import SessionLocal
    from sqlalchemy import select

    db = SessionLocal()
    try:
        defn = db.scalar(
            select(WorkflowDefinition).where(WorkflowDefinition.name == "Petty Cash Approval")
        )
        assert defn
        instance_engine.validate_form_data(defn, {"amount": 10, "purpose": "ok", "department": "it"})
        try:
            instance_engine.validate_form_data(
                defn, {"amount": -1, "purpose": "ok", "department": "it"}
            )
            raise AssertionError("negative amount should be rejected")
        except instance_engine.RequestError as e:
            assert "positive" in str(e).lower() or "amount" in str(e).lower()
        try:
            instance_engine.validate_form_data(
                defn, {"amount": "not-a-number", "purpose": "ok", "department": "it"}
            )
            raise AssertionError("invalid number string should be rejected")
        except instance_engine.RequestError:
            pass
    finally:
        db.close()


def test_submit_amount_and_routing() -> None:
    headers = login("originator@demo.wizflow.biz")
    wf_id = _petty_workflow_id(headers)

    r_neg = client.post(
        f"/api/v1/workflows/{wf_id}/submit",
        json={"data": {"amount": -50, "purpose": "bad", "department": "it"}},
        headers=headers,
    )
    assert r_neg.status_code == 400, r_neg.text

    r_str = client.post(
        f"/api/v1/workflows/{wf_id}/submit",
        json={"data": {"amount": "6000", "purpose": "str amt", "department": "it"}},
        headers=headers,
    )
    assert r_str.status_code == 201, r_str.text
    assert r_str.json()["step_sequence"] == ["step_finance"]

    r_low = client.post(
        f"/api/v1/workflows/{wf_id}/submit",
        json={"data": {"amount": 200, "purpose": "low", "department": "it"}},
        headers=headers,
    )
    assert r_low.status_code == 201, r_low.text
    assert r_low.json()["step_sequence"] == ["step_manager", "step_finance"]

    ref = r_low.json().get("reference_number") or ""
    assert ref.startswith("PC-"), ref
    refs = {r_str.json()["reference_number"], r_low.json()["reference_number"]}
    assert len(refs) == 2, refs


def run() -> None:
    test_simulate_routing_low_high()
    test_validate_form_number_fields()
    test_submit_amount_and_routing()
    print("All API logic tests passed.")


if __name__ == "__main__":
    run()
