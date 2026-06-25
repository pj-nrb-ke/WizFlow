"""Tests for public form token management, public form access, and guest submissions.

Covers: Features 3-7, 10-14 (public form link, guest submit, accept/reject).
"""

import io
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# ── magic bytes ──────────────────────────────────────────────────────────────
_PDF_HEADER = b"%PDF-1.4 fake content"
_JPEG_HEADER = b"\xff\xd8\xff\xe0" + b"\x00" * 100
_PNG_HEADER = b"\x89\x50\x4e\x47\x0d\x0a\x1a\x0a" + b"\x00" * 100
_BAD_FILE = b"this is just plain text and not an allowed file type"


# ── fixtures ─────────────────────────────────────────────────────────────────

def _login(email: str = "admin@demo.wizflow.biz", password: str = "changeme") -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        pytest.skip(f"User {email} not seeded (status {r.status_code}) — run seed.py first")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# Module-scoped so login is called once per file, not once per test (avoids rate-limit)
@pytest.fixture(scope="module")
def admin_headers():
    return _login()


@pytest.fixture(scope="module")
def published_wf_id(admin_headers):
    """Return the id of any published workflow, skip if none."""
    wfs = client.get("/api/v1/workflows?status=published", headers=admin_headers).json()
    if not wfs:
        pytest.skip("No published workflows seeded")
    return wfs[0]["id"]


@pytest.fixture
def public_token(admin_headers, published_wf_id):
    """Create a public link and return the raw token string."""
    r = client.post(f"/api/v1/workflows/{published_wf_id}/public-link", headers=admin_headers)
    assert r.status_code == 201, f"Could not create public link: {r.text}"
    url = r.json()["url"]
    return url.split("/p/")[-1]


@pytest.fixture
def guest_submission_id(public_token):
    """Submit a guest form and return the submission id."""
    r = client.post(
        f"/api/v1/public/forms/{public_token}/submit",
        json={
            "guest_name": "Test Guest",
            "guest_email": f"guest-{uuid.uuid4().hex[:6]}@example.com",
            "data": {"__note": "automated test"},
            "honeypot": "",
        },
    )
    assert r.status_code == 200, f"Guest submit failed: {r.text}"
    return r.json()["id"]


# ── public link management ────────────────────────────────────────────────────

def test_get_public_link_none(admin_headers, published_wf_id):
    """New workflow has no active public link."""
    # Revoke any existing link first so we start clean
    client.delete(f"/api/v1/workflows/{published_wf_id}/public-link", headers=admin_headers)
    r = client.get(f"/api/v1/workflows/{published_wf_id}/public-link", headers=admin_headers)
    assert r.status_code == 200
    # Returns null / None
    assert r.json() is None or r.json() == {}


def test_create_public_link(admin_headers, published_wf_id):
    r = client.post(f"/api/v1/workflows/{published_wf_id}/public-link", headers=admin_headers)
    assert r.status_code == 201
    body = r.json()
    assert "url" in body
    assert "/p/" in body["url"]
    assert body["revoked"] is False


def test_create_public_link_replaces_existing(admin_headers, published_wf_id):
    r1 = client.post(f"/api/v1/workflows/{published_wf_id}/public-link", headers=admin_headers)
    r2 = client.post(f"/api/v1/workflows/{published_wf_id}/public-link", headers=admin_headers)
    assert r1.status_code == 201
    assert r2.status_code == 201
    # New link has a different token
    assert r1.json()["url"] != r2.json()["url"]


def test_get_public_link_after_create(admin_headers, published_wf_id, public_token):
    r = client.get(f"/api/v1/workflows/{published_wf_id}/public-link", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    assert body is not None
    assert "/p/" in body["url"]
    assert body["revoked"] is False


def test_revoke_public_link(admin_headers, published_wf_id, public_token):
    r = client.delete(f"/api/v1/workflows/{published_wf_id}/public-link", headers=admin_headers)
    assert r.status_code == 204
    # Link should no longer be listed as active
    r2 = client.get(f"/api/v1/workflows/{published_wf_id}/public-link", headers=admin_headers)
    assert r2.json() is None


def test_public_link_requires_auth(published_wf_id):
    # Use fresh client with no cookies to avoid inheriting the module-level session
    fresh = TestClient(app)
    r = fresh.post(f"/api/v1/workflows/{published_wf_id}/public-link")
    assert r.status_code in (401, 403)


# ── unauthenticated form access ───────────────────────────────────────────────

def test_get_public_form(public_token):
    r = client.get(f"/api/v1/public/forms/{public_token}")
    assert r.status_code == 200
    body = r.json()
    assert "workflow_name" in body
    assert "form_schema" in body
    assert "company_name" in body


def test_get_public_form_invalid_token():
    r = client.get("/api/v1/public/forms/totally-invalid-token-xyz")
    assert r.status_code == 404


def test_get_public_form_revoked(admin_headers, published_wf_id, public_token):
    client.delete(f"/api/v1/workflows/{published_wf_id}/public-link", headers=admin_headers)
    r = client.get(f"/api/v1/public/forms/{public_token}")
    assert r.status_code == 404


# ── guest form submission ─────────────────────────────────────────────────────

def test_submit_public_form(public_token):
    r = client.post(
        f"/api/v1/public/forms/{public_token}/submit",
        json={
            "guest_name": "Alice Tester",
            "guest_email": "alice@example.com",
            "data": {"reason": "I need access"},
            "honeypot": "",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert "id" in body
    assert "message" in body


def test_submit_honeypot_silently_discards(public_token):
    """Honeypot filled → 200 but submission is silently discarded."""
    r = client.post(
        f"/api/v1/public/forms/{public_token}/submit",
        json={
            "guest_name": "Bot",
            "guest_email": "bot@spam.com",
            "data": {},
            "honeypot": "I am a robot",
        },
    )
    assert r.status_code == 200  # silent discard


def test_submit_strips_html(public_token, admin_headers, published_wf_id):
    unique_email = f"html-test-{uuid.uuid4().hex[:6]}@example.com"
    r = client.post(
        f"/api/v1/public/forms/{public_token}/submit",
        json={
            "guest_name": "HTML<script>alert(1)</script>Tester",
            "guest_email": unique_email,
            "data": {"comment": "<b>hello</b> <script>xss()</script> world"},
            "honeypot": "",
        },
    )
    assert r.status_code == 200
    sub_id = r.json()["id"]

    subs = client.get(
        f"/api/v1/workflows/{published_wf_id}/guest-submissions",
        headers=admin_headers,
    ).json()
    match = next((s for s in subs if s["id"] == sub_id), None)
    if match:
        detail = client.get(
            f"/api/v1/workflows/{published_wf_id}/guest-submissions/{sub_id}",
            headers=admin_headers,
        ).json()
        comment = detail["data"].get("comment", "")
        assert "<b>" not in comment
        assert "<script>" not in comment
        assert "hello" in comment
        assert "world" in comment


def test_submit_missing_name_rejected(public_token):
    r = client.post(
        f"/api/v1/public/forms/{public_token}/submit",
        json={"guest_name": "", "guest_email": "test@example.com", "data": {}, "honeypot": ""},
    )
    assert r.status_code == 422


def test_submit_invalid_email_rejected(public_token):
    r = client.post(
        f"/api/v1/public/forms/{public_token}/submit",
        json={"guest_name": "Valid Name", "guest_email": "not-an-email", "data": {}, "honeypot": ""},
    )
    assert r.status_code == 422


def test_submit_to_revoked_token(admin_headers, published_wf_id, public_token):
    client.delete(f"/api/v1/workflows/{published_wf_id}/public-link", headers=admin_headers)
    r = client.post(
        f"/api/v1/public/forms/{public_token}/submit",
        json={"guest_name": "Anyone", "guest_email": "x@y.com", "data": {}, "honeypot": ""},
    )
    assert r.status_code == 404


# ── guest submission management ───────────────────────────────────────────────

def test_list_guest_submissions(admin_headers, published_wf_id, guest_submission_id):
    r = client.get(
        f"/api/v1/workflows/{published_wf_id}/guest-submissions",
        headers=admin_headers,
    )
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    ids = [s["id"] for s in items]
    assert guest_submission_id in ids


def test_get_guest_submission_detail(admin_headers, published_wf_id, guest_submission_id):
    r = client.get(
        f"/api/v1/workflows/{published_wf_id}/guest-submissions/{guest_submission_id}",
        headers=admin_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == guest_submission_id
    assert "data" in body
    assert "attachments" in body
    assert isinstance(body["attachments"], list)
    assert body["status"] == "pending"


def test_reject_guest_submission(admin_headers, published_wf_id, public_token):
    unique_email = f"reject-{uuid.uuid4().hex[:6]}@example.com"
    sub = client.post(
        f"/api/v1/public/forms/{public_token}/submit",
        json={"guest_name": "Reject Me", "guest_email": unique_email, "data": {}, "honeypot": ""},
    )
    sub_id = sub.json()["id"]

    r = client.post(
        f"/api/v1/workflows/{published_wf_id}/guest-submissions/{sub_id}/reject",
        headers=admin_headers,
        json={"reason": "Not eligible"},
    )
    assert r.status_code == 200

    detail = client.get(
        f"/api/v1/workflows/{published_wf_id}/guest-submissions/{sub_id}",
        headers=admin_headers,
    ).json()
    assert detail["status"] == "rejected"


def test_accept_guest_submission(admin_headers, published_wf_id, public_token):
    unique_email = f"accept-{uuid.uuid4().hex[:8]}@wiz-test.example.com"
    sub = client.post(
        f"/api/v1/public/forms/{public_token}/submit",
        json={"guest_name": "Accept Me", "guest_email": unique_email, "data": {}, "honeypot": ""},
    )
    sub_id = sub.json()["id"]

    r = client.post(
        f"/api/v1/workflows/{published_wf_id}/guest-submissions/{sub_id}/accept",
        headers=admin_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert "user_id" in body

    detail = client.get(
        f"/api/v1/workflows/{published_wf_id}/guest-submissions/{sub_id}",
        headers=admin_headers,
    ).json()
    assert detail["status"] == "accepted"


def test_accept_duplicate_email_blocked(admin_headers, published_wf_id, public_token):
    """Accepting same email twice returns 409."""
    unique_email = f"dup-{uuid.uuid4().hex[:8]}@wiz-test.example.com"

    def _submit():
        r = client.post(
            f"/api/v1/public/forms/{public_token}/submit",
            json={"guest_name": "Dup Test", "guest_email": unique_email, "data": {}, "honeypot": ""},
        )
        return r.json()["id"]

    sub_id1 = _submit()
    sub_id2 = _submit()

    r1 = client.post(
        f"/api/v1/workflows/{published_wf_id}/guest-submissions/{sub_id1}/accept",
        headers=admin_headers,
    )
    assert r1.status_code == 200

    r2 = client.post(
        f"/api/v1/workflows/{published_wf_id}/guest-submissions/{sub_id2}/accept",
        headers=admin_headers,
    )
    assert r2.status_code == 409


def test_cannot_re_reject_accepted(admin_headers, published_wf_id, public_token):
    unique_email = f"nore-{uuid.uuid4().hex[:8]}@wiz-test.example.com"
    sub = client.post(
        f"/api/v1/public/forms/{public_token}/submit",
        json={"guest_name": "NoRe", "guest_email": unique_email, "data": {}, "honeypot": ""},
    )
    sub_id = sub.json()["id"]

    client.post(
        f"/api/v1/workflows/{published_wf_id}/guest-submissions/{sub_id}/accept",
        headers=admin_headers,
    )
    r = client.post(
        f"/api/v1/workflows/{published_wf_id}/guest-submissions/{sub_id}/reject",
        headers=admin_headers,
        json={"reason": "Changed my mind"},
    )
    assert r.status_code == 400


def test_management_requires_auth(published_wf_id):
    fresh = TestClient(app)
    r = fresh.get(f"/api/v1/workflows/{published_wf_id}/guest-submissions")
    assert r.status_code in (401, 403)


# ── file upload ───────────────────────────────────────────────────────────────

def test_upload_pdf_valid(public_token):
    r = client.post(
        f"/api/v1/public/forms/{public_token}/upload",
        data={"field_key": "kyc_doc"},
        files={"file": ("document.pdf", io.BytesIO(_PDF_HEADER), "application/pdf")},
    )
    assert r.status_code == 200
    body = r.json()
    assert "id" in body
    assert body["original_filename"] == "document.pdf"
    assert body["size_bytes"] == len(_PDF_HEADER)


def test_upload_jpeg_valid(public_token):
    r = client.post(
        f"/api/v1/public/forms/{public_token}/upload",
        data={"field_key": "photo"},
        files={"file": ("photo.jpg", io.BytesIO(_JPEG_HEADER), "image/jpeg")},
    )
    assert r.status_code == 200


def test_upload_png_valid(public_token):
    r = client.post(
        f"/api/v1/public/forms/{public_token}/upload",
        data={"field_key": "photo"},
        files={"file": ("image.png", io.BytesIO(_PNG_HEADER), "image/png")},
    )
    assert r.status_code == 200


def test_upload_invalid_mime_type_rejected(public_token):
    """Plain text file rejected regardless of content-type header."""
    r = client.post(
        f"/api/v1/public/forms/{public_token}/upload",
        data={"field_key": "doc"},
        files={"file": ("evil.pdf", io.BytesIO(_BAD_FILE), "application/pdf")},
    )
    assert r.status_code == 415


def test_upload_exe_disguised_as_pdf_rejected(public_token):
    exe_bytes = b"MZ\x90\x00" + b"\x00" * 100  # DOS/PE header
    r = client.post(
        f"/api/v1/public/forms/{public_token}/upload",
        data={"field_key": "doc"},
        files={"file": ("virus.pdf", io.BytesIO(exe_bytes), "application/pdf")},
    )
    assert r.status_code == 415


def test_upload_invalid_token(public_token):
    r = client.post(
        "/api/v1/public/forms/invalid-token-xyz/upload",
        data={"field_key": "doc"},
        files={"file": ("doc.pdf", io.BytesIO(_PDF_HEADER), "application/pdf")},
    )
    assert r.status_code == 404


def test_upload_links_to_submission(public_token, admin_headers, published_wf_id):
    """Upload a file, then submit the form referencing the attachment id. Detail shows it."""
    up = client.post(
        f"/api/v1/public/forms/{public_token}/upload",
        data={"field_key": "id_document"},
        files={"file": ("id.pdf", io.BytesIO(_PDF_HEADER), "application/pdf")},
    )
    assert up.status_code == 200
    att_id = up.json()["id"]

    unique_email = f"att-{uuid.uuid4().hex[:8]}@wiz-test.example.com"
    sub = client.post(
        f"/api/v1/public/forms/{public_token}/submit",
        json={
            "guest_name": "Attachment Tester",
            "guest_email": unique_email,
            "data": {"id_document": att_id},
            "honeypot": "",
        },
    )
    assert sub.status_code == 200
    sub_id = sub.json()["id"]

    detail = client.get(
        f"/api/v1/workflows/{published_wf_id}/guest-submissions/{sub_id}",
        headers=admin_headers,
    ).json()
    att_ids = [a["id"] for a in detail["attachments"]]
    assert att_id in att_ids
    att_info = next(a for a in detail["attachments"] if a["id"] == att_id)
    assert att_info["field_key"] == "id_document"
    assert att_info["original_filename"] == "id.pdf"


def test_download_attachment(public_token, admin_headers, published_wf_id):
    """Upload → submit → download via manager endpoint."""
    up = client.post(
        f"/api/v1/public/forms/{public_token}/upload",
        data={"field_key": "cert"},
        files={"file": ("cert.pdf", io.BytesIO(_PDF_HEADER), "application/pdf")},
    )
    att_id = up.json()["id"]

    unique_email = f"dl-{uuid.uuid4().hex[:8]}@wiz-test.example.com"
    client.post(
        f"/api/v1/public/forms/{public_token}/submit",
        json={
            "guest_name": "Downloader",
            "guest_email": unique_email,
            "data": {"cert": att_id},
            "honeypot": "",
        },
    )

    r = client.get(f"/api/v1/guest-attachments/{att_id}/download", headers=admin_headers)
    assert r.status_code == 200
    assert r.content == _PDF_HEADER


def test_download_orphan_attachment_blocked(public_token, admin_headers):
    """Orphan attachment (not yet submitted) cannot be downloaded."""
    up = client.post(
        f"/api/v1/public/forms/{public_token}/upload",
        data={"field_key": "cert"},
        files={"file": ("cert.pdf", io.BytesIO(_PDF_HEADER), "application/pdf")},
    )
    att_id = up.json()["id"]
    r = client.get(f"/api/v1/guest-attachments/{att_id}/download", headers=admin_headers)
    assert r.status_code == 404


def test_download_requires_auth(public_token):
    fresh = TestClient(app)
    r = fresh.get(f"/api/v1/guest-attachments/{uuid.uuid4()}/download")
    assert r.status_code in (401, 403)
