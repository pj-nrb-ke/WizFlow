"""Full end-to-end use-case test of the WizFlow API (the engine behind the web app).

Run against the local dev API:  python -m scripts.test_full_e2e
Exercises auth, manual + AI + custom workflow creation, preview/simulate/publish,
versioning, submit, inbox, approve/reject/return, routing, notifications,
analytics, reports, exports, master data, admin, integrations, and negative cases.
"""

from __future__ import annotations

import os
import sys
import uuid

import httpx

BASE = os.environ.get("E2E_BASE", "http://localhost:8010/api/v1")
EMAIL = os.environ.get("E2E_EMAIL", "admin@demo.wizflow.biz")
PASSWORD = os.environ.get("E2E_PASSWORD", "changeme")

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))
    return ok


def main() -> int:
    c = httpx.Client(timeout=30.0)
    H: dict[str, str] = {}

    # ---- UC1 Auth ----
    print("UC1 Auth")
    r = c.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if not check("login returns 200 + token", r.status_code == 200 and "access_token" in r.json(), f"{r.status_code} {r.text[:120]}"):
        print("Cannot continue without auth.")
        return summarize()
    token = r.json()["access_token"]
    H = {"Authorization": f"Bearer {token}"}
    me = c.get(f"{BASE}/auth/me", headers=H)
    check("auth/me 200", me.status_code == 200, str(me.status_code))
    check("auth/me has company", bool(me.json().get("company_id") or me.json().get("company_name")), me.text[:120])
    bad = c.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": "wrong"})
    check("bad password rejected (401/400)", bad.status_code in (400, 401), str(bad.status_code))
    noauth = httpx.get(f"{BASE}/workflows", timeout=10)
    check("unauthenticated workflows blocked (401)", noauth.status_code == 401, str(noauth.status_code))

    # ---- UC2 List workflows ----
    print("UC2 List workflows")
    wfs = c.get(f"{BASE}/workflows", headers=H)
    check("list workflows 200", wfs.status_code == 200, str(wfs.status_code))
    pub = c.get(f"{BASE}/workflows?status=published&initiator_only=true", headers=H)
    check("list published+initiator 200", pub.status_code == 200, str(pub.status_code))

    # ---- UC3 AI draft + wizard ----
    print("UC3 AI draft / wizard")
    d = c.post(f"{BASE}/ai/workflow/draft", headers=H, json={"description": "Purchase request with manager and finance approval over 10000; fields amount, vendor"})
    okd = d.status_code == 200 and "draft" in d.json()
    check("ai draft 200 + draft", okd, f"{d.status_code} {d.text[:120]}")
    if okd:
        dd = d.json()["draft"]
        check("ai draft has steps", len(dd.get("steps") or []) >= 1)
        check("ai draft has form fields", len((dd.get("form_schema") or {}).get("fields") or []) >= 1)
        # routing rules, if any, must be in engine format (when/skip_to) — the normalizer
        rr = dd.get("routing_rules") or []
        check("ai routing rules normalized", all(("when" in x and "skip_to" in x) for x in rr) if rr else True, str(rr)[:160])
    q = c.post(f"{BASE}/ai/workflow/wizard/questions", headers=H, json={"description": "Leave approval workflow"})
    check("wizard questions 200", q.status_code == 200 and len(q.json().get("questions", [])) > 0, str(q.status_code))

    # ---- UC4 Manual workflow lifecycle (admin-approvable: both steps company_admin) ----
    print("UC4 Manual workflow -> preview -> simulate -> publish")
    name = f"E2E Test WF {uuid.uuid4().hex[:8]}"
    body = {
        "name": name,
        "form_schema": {"fields": [
            {"key": "amount", "type": "number", "label": "Amount", "required": True},
            {"key": "purpose", "type": "text", "label": "Purpose", "required": True},
        ]},
        "steps": [
            {"id": "step_1", "name": "First Approval", "type": "approval", "assignee": {"type": "role", "value": "company_admin"}},
            {"id": "step_2", "name": "Second Approval", "type": "approval", "assignee": {"type": "role", "value": "company_admin"}},
        ],
        "routing_rules": [{"when": {"field": "amount", "op": "gt", "value": 1000}, "skip_to": "step_2"}],
        "settings": {"sla_hours": 48},
    }
    cw = c.post(f"{BASE}/workflows", headers=H, json=body)
    okcw = cw.status_code in (200, 201)
    check("create workflow 201", okcw, f"{cw.status_code} {cw.text[:160]}")
    if not okcw:
        return summarize()
    wid = cw.json()["id"]
    chk = c.get(f"{BASE}/workflows/check-name?name={name}", headers=H)
    check("check-name reports taken", chk.status_code == 200 and chk.json().get("available") is False, chk.text[:120])
    prev = c.get(f"{BASE}/workflows/{wid}/preview", headers=H)
    check("preview 200", prev.status_code == 200, str(prev.status_code))
    hc = c.get(f"{BASE}/workflows/{wid}/health-check", headers=H)
    check("health-check 200", hc.status_code == 200, str(hc.status_code))
    sim_lo = c.post(f"{BASE}/workflows/{wid}/simulate", headers=H, json={"data": {"amount": 500, "purpose": "x"}})
    check("simulate low amount -> both steps", sim_lo.status_code == 200 and sim_lo.json().get("steps_traversed") == ["step_1", "step_2"], sim_lo.text[:160])
    sim_hi = c.post(f"{BASE}/workflows/{wid}/simulate", headers=H, json={"data": {"amount": 5000, "purpose": "x"}})
    check("simulate high amount -> skip to step_2", sim_hi.status_code == 200 and sim_hi.json().get("steps_traversed") == ["step_2"], sim_hi.text[:160])
    pubr = c.post(f"{BASE}/workflows/{wid}/publish", headers=H, json={"confirm_preview": True, "test_completed": True})
    check("publish 200 + status published", pubr.status_code == 200 and pubr.json().get("status") == "published", pubr.text[:160])

    # ---- UC5 Submit + approve to completion ----
    print("UC5 Submit -> approve end-to-end")
    sub = c.post(f"{BASE}/workflows/{wid}/submit", headers=H, json={"data": {"amount": 500, "purpose": "E2E approve"}})
    oksub = sub.status_code in (200, 201)
    check("submit 201 + reference", oksub and bool(sub.json().get("reference_number")), f"{sub.status_code} {sub.text[:160]}")
    if oksub:
        rid = sub.json()["id"]
        det = c.get(f"{BASE}/requests/{rid}", headers=H)
        check("request detail 200", det.status_code == 200, str(det.status_code))
        # approve step 1
        a1 = c.post(f"{BASE}/requests/{rid}/approve", headers=H, json={"comment": "ok1"})
        check("approve step 1", a1.status_code in (200, 201), f"{a1.status_code} {a1.text[:160]}")
        a2 = c.post(f"{BASE}/requests/{rid}/approve", headers=H, json={"comment": "ok2"})
        check("approve step 2", a2.status_code in (200, 201), f"{a2.status_code} {a2.text[:160]}")
        det2 = c.get(f"{BASE}/requests/{rid}", headers=H)
        check("request now approved", det2.status_code == 200 and det2.json().get("status") == "approved", det2.json().get("status", "?"))

    # ---- UC6 Submit + reject ----
    print("UC6 Submit -> reject")
    sub2 = c.post(f"{BASE}/workflows/{wid}/submit", headers=H, json={"data": {"amount": 200, "purpose": "E2E reject"}})
    if check("submit#2 201", sub2.status_code in (200, 201), f"{sub2.status_code} {sub2.text[:120]}"):
        rid2 = sub2.json()["id"]
        rj = c.post(f"{BASE}/requests/{rid2}/reject", headers=H, json={"comment": "no"})
        check("reject ok", rj.status_code in (200, 201), f"{rj.status_code} {rj.text[:120]}")
        d2 = c.get(f"{BASE}/requests/{rid2}", headers=H)
        check("request now rejected", d2.json().get("status") == "rejected", d2.json().get("status", "?"))

    # ---- UC7 Negative validation ----
    print("UC7 Negative amount rejected")
    neg = c.post(f"{BASE}/workflows/{wid}/submit", headers=H, json={"data": {"amount": -5, "purpose": "bad"}})
    check("negative amount rejected (400)", neg.status_code == 400, str(neg.status_code))

    # ---- UC8 Versioning ----
    print("UC8 Versioning")
    nv = c.post(f"{BASE}/workflows/{wid}/new-version", headers=H)
    check("new draft version 201", nv.status_code in (200, 201), f"{nv.status_code} {nv.text[:120]}")
    vers = c.get(f"{BASE}/workflows/{wid}/versions", headers=H)
    check("versions list 200", vers.status_code == 200, str(vers.status_code))

    # ---- UC9 Inbox ----
    print("UC9 Inbox")
    inb = c.get(f"{BASE}/inbox?limit=20", headers=H)
    check("inbox list 200", inb.status_code == 200, f"{inb.status_code} {inb.text[:120]}")

    # ---- UC10 Notifications ----
    print("UC10 Notifications")
    nl = c.get(f"{BASE}/notifications", headers=H)
    check("notifications 200", nl.status_code == 200, str(nl.status_code))
    uc = c.get(f"{BASE}/notifications/unread-count", headers=H)
    check("unread-count 200", uc.status_code == 200, str(uc.status_code))

    # ---- UC11 Analytics + reports ----
    print("UC11 Analytics / reports")
    for ep in ["/analytics/executive", "/analytics/workflows", "/analytics/users"]:
        rr = c.get(f"{BASE}{ep}", headers=H)
        check(f"GET {ep} 200", rr.status_code == 200, f"{rr.status_code} {rr.text[:100]}")
    mis = c.get(f"{BASE}/reports/mis/actions", headers=H)
    check("reports mis actions 200", mis.status_code == 200, str(mis.status_code))

    # ---- UC12 Exports ----
    print("UC12 Exports")
    for ep, label in [("/workflows/export.xlsx", "workflows xlsx"), ("/requests/export.csv", "requests csv"), ("/inbox/export.csv", "inbox csv")]:
        rr = c.get(f"{BASE}{ep}", headers=H)
        check(f"export {label} 200", rr.status_code == 200 and len(rr.content) > 0, str(rr.status_code))

    # ---- UC13 Master data / admin / org ----
    print("UC13 Master data / admin / org")
    md = c.get(f"{BASE}/master-data", headers=H)
    check("master-data 200", md.status_code == 200, str(md.status_code))
    od = c.get(f"{BASE}/workflows/org-directory", headers=H)
    check("org-directory 200", od.status_code == 200, str(od.status_code))
    cu = c.get(f"{BASE}/workflows/company-users", headers=H)
    check("company-users 200", cu.status_code == 200, str(cu.status_code))
    au = c.get(f"{BASE}/admin/users", headers=H)
    check("admin users 200", au.status_code == 200, f"{au.status_code} {au.text[:120]}")
    rl = c.get(f"{BASE}/admin/roles", headers=H)
    check("admin roles 200", rl.status_code == 200, str(rl.status_code))
    ug = c.get(f"{BASE}/admin/user-groups", headers=H)
    check("admin user-groups 200", ug.status_code == 200, str(ug.status_code))

    # ---- UC14 Custom workflow build ----
    print("UC14 Custom workflow")
    forms = c.get(f"{BASE}/workflows/form-options", headers=H)
    check("form-options 200", forms.status_code == 200, str(forms.status_code))
    users = od.json().get("users", []) if od.status_code == 200 else []
    form_list = forms.json() if forms.status_code == 200 else []
    if form_list and users:
        cwf = c.post(f"{BASE}/workflows/custom", headers=H, json={
            "name": f"E2E Custom {uuid.uuid4().hex[:6]}",
            "attached_form_workflow_id": form_list[0]["id"],
            "initiator": {"everyone": True, "user_ids": [], "group_ids": []},
            "approver_chain": [{"type": "user", "id": users[0]["id"]}],
        })
        check("create custom workflow 201", cwf.status_code in (200, 201), f"{cwf.status_code} {cwf.text[:160]}")
    else:
        check("custom workflow prerequisites present", False, "no published form with fields or no users")

    # ---- UC15 Integrations ----
    print("UC15 Integrations")
    ak = c.get(f"{BASE}/admin/integrations/api-keys", headers=H)
    check("api-keys list 200", ak.status_code == 200, str(ak.status_code))
    wh = c.get(f"{BASE}/admin/integrations/webhooks", headers=H)
    check("webhooks list 200", wh.status_code == 200, str(wh.status_code))

    print("UC16 Clone workflow / webhook test")
    cl = c.post(f"{BASE}/workflows/{wid}/clone", headers=H)
    check("clone workflow -> draft", cl.status_code in (200, 201) and cl.json().get("status") == "draft", f"{cl.status_code} {cl.text[:120]}")
    hook = c.post(f"{BASE}/admin/integrations/webhooks", headers=H, json={"name": "E2E hook", "url": "https://example.com/hook", "events": ["request.submitted"]})
    if check("create webhook 201", hook.status_code in (200, 201), f"{hook.status_code} {hook.text[:120]}"):
        hid = hook.json()["id"]
        tw = c.post(f"{BASE}/admin/integrations/webhooks/{hid}/test", headers=H)
        check("webhook test returns delivery", tw.status_code == 200 and "success" in tw.json(), f"{tw.status_code} {tw.text[:120]}")
        c.delete(f"{BASE}/admin/integrations/webhooks/{hid}", headers=H)

    return summarize()


def summarize() -> int:
    total = len(results)
    failed = [r for r in results if not r[1]]
    print("\n" + "=" * 60)
    print(f"RESULT: {total - len(failed)}/{total} passed, {len(failed)} failed")
    if failed:
        print("FAILURES:")
        for name, _, detail in failed:
            print(f"  - {name}: {detail}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
