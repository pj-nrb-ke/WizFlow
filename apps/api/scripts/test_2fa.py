"""End-to-end test of TOTP 2FA. Enrolls, enables, verifies login gating, disables.
Leaves the account back in its original (no-2FA) state. Run: python -m scripts.test_2fa
"""
from __future__ import annotations

import os
import sys

import httpx
import pyotp

BASE = os.environ.get("E2E_BASE", "http://localhost:8010/api/v1")
EMAIL = os.environ.get("E2E_EMAIL", "admin@demo.wizflow.biz")
PASSWORD = os.environ.get("E2E_PASSWORD", "changeme")

results: list[tuple[str, bool]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))


def login(c, code=None):
    payload = {"email": EMAIL, "password": PASSWORD}
    if code is not None:
        payload["code"] = code
    return c.post(f"{BASE}/auth/login", json=payload)


def main() -> int:
    c = httpx.Client(timeout=20.0)
    r = login(c)
    check("baseline login (no 2FA) 200", r.status_code == 200, str(r.status_code))
    if r.status_code != 200:
        return done()
    H = {"Authorization": f"Bearer {r.json()['access_token']}"}

    st = c.get(f"{BASE}/auth/2fa/status", headers=H)
    check("2fa status 200", st.status_code == 200, str(st.status_code))

    setup = c.post(f"{BASE}/auth/2fa/setup", headers=H)
    ok = setup.status_code == 200 and setup.json().get("secret")
    check("2fa setup returns secret + uri", bool(ok), f"{setup.status_code} {setup.text[:120]}")
    if not ok:
        return done()
    secret = setup.json()["secret"]
    check("otpauth uri well-formed", setup.json().get("otpauth_uri", "").startswith("otpauth://totp/"), setup.json().get("otpauth_uri", "")[:60])

    totp = pyotp.TOTP(secret)
    # wrong code cannot enable
    bad = c.post(f"{BASE}/auth/2fa/enable", headers=H, json={"code": "000000"})
    check("enable rejects wrong code (400)", bad.status_code == 400, str(bad.status_code))
    # correct code enables
    en = c.post(f"{BASE}/auth/2fa/enable", headers=H, json={"code": totp.now()})
    check("enable with correct code -> enabled", en.status_code == 200 and en.json().get("enabled") is True, en.text[:120])

    # login without code now blocked
    no_code = login(c)
    check("login without code -> two_factor_required", no_code.status_code == 401 and no_code.json().get("detail") == "two_factor_required", no_code.text[:120])
    # login with wrong code blocked
    wrong = login(c, code="123456")
    check("login wrong code -> invalid_code", wrong.status_code == 401 and wrong.json().get("detail") == "invalid_code", wrong.text[:120])
    # login with correct code succeeds
    good = login(c, code=totp.now())
    check("login with correct code -> 200 token", good.status_code == 200 and "access_token" in good.json(), good.text[:120])

    # me reflects enabled
    me = c.get(f"{BASE}/auth/me", headers=H)
    check("me.two_factor_enabled true", me.status_code == 200 and me.json().get("two_factor_enabled") is True, str(me.status_code))

    # disable (cleanup) — must restore no-2FA so other tests/login keep working
    dis = c.post(f"{BASE}/auth/2fa/disable", headers=H, json={"code": totp.now()})
    check("disable -> enabled false", dis.status_code == 200 and dis.json().get("enabled") is False, dis.text[:120])
    after = login(c)
    check("login after disable (no code) 200", after.status_code == 200, str(after.status_code))
    return done()


def done() -> int:
    failed = [n for n, ok in results if not ok]
    print("\n" + "=" * 50)
    print(f"RESULT: {len(results) - len(failed)}/{len(results)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
