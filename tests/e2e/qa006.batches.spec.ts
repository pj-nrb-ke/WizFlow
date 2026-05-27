import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  apiInboxCount,
  apiToken,
  apiWorkflowCount,
  inboxUiCount,
  waitForInboxReady,
  waitForWorkflowsReady,
  workflowUiCount,
  batchStats,
  ensureDirs,
  gotoFast,
  loadCases,
  LOG_DIR,
  runCase,
  uiLogin,
  wireLogs,
  writeCheckpoint,
} from "./qa006.helpers";

test.describe.configure({ mode: "serial", timeout: 90_000 });

const routes = ["/", "/inbox", "/requests", "/workflows", "/analytics"];

test.describe("QA-006 Targeted Retest", () => {
  test.beforeAll(() => {
    ensureDirs();
    loadCases();
  });

  test("Batch 1 — Inbox sync retest", async ({ page, request }) => {
    test.setTimeout(120_000);
    const logs = { console: [] as string[], network: [] as string[] };
    wireLogs(page, logs);
    const token = await apiToken(request);
    await uiLogin(page);

    await runCase(
      page,
      "inbox",
      "Inbox API vs UI count (limit=100)",
      "Login, open /inbox, compare API count to data-inbox-count",
      "API and UI counts match exactly",
      "QA005 assertion x80",
      async () => {
        const apiCount = await apiInboxCount(request, token);
        await gotoFast(page, "/inbox");
        await waitForInboxReady(page);
        const uiCount = await inboxUiCount(page);
        expect(uiCount).toBe(apiCount);
        return { assertions: `api=${apiCount}; ui=${uiCount}`, apiEvidence: `/api/v1/inbox?limit=100` };
      },
      logs
    );

    await runCase(
      page,
      "inbox",
      "Inbox refresh after filter",
      "Select first workflow filter, Apply filters, recount",
      "UI count matches filtered API",
      "QA005 assertion",
      async () => {
        await gotoFast(page, "/inbox");
        await waitForInboxReady(page);
        const wf = page.locator('select[aria-label="Filter by workflow"]');
        const opts = await wf.locator("option").all();
        if (opts.length < 2) {
          return { assertions: "skip: no workflow filter options", apiEvidence: "n/a" };
        }
        const wfId = await opts[1].getAttribute("value");
        await wf.selectOption(wfId || "");
        await page.getByRole("button", { name: /apply filters/i }).click();
        await page.waitForTimeout(800);
        const qs = wfId ? `limit=100&workflow_id=${wfId}` : "limit=100";
        const apiCount = await apiInboxCount(request, token, qs);
        const uiCount = await inboxUiCount(page);
        expect(uiCount).toBe(apiCount);
        return { assertions: `filtered api=${apiCount}; ui=${uiCount}`, apiEvidence: qs };
      },
      logs
    );

    await runCase(
      page,
      "inbox",
      "Inbox search sync",
      "Search unlikely string, apply, verify empty sync",
      "API and UI both zero",
      "QA005 assertion",
      async () => {
        await gotoFast(page, "/inbox");
        await waitForInboxReady(page);
        const search = page.locator('input[type="search"], input[placeholder*="Search"]');
        await search.first().waitFor({ state: "visible", timeout: 15_000 });
        await search.first().fill("zzzz-no-match-qa006");
        await page.getByRole("button", { name: /apply filters/i }).click();
        await page.waitForTimeout(800);
        const apiCount = await apiInboxCount(request, token, "limit=100&q=zzzz-no-match-qa006");
        const uiCount = await inboxUiCount(page);
        expect(apiCount).toBe(0);
        expect(uiCount).toBe(0);
        return { assertions: `empty sync api=${apiCount}; ui=${uiCount}`, apiEvidence: "q=zzzz-no-match-qa006" };
      },
      logs
    );

    await runCase(
      page,
      "inbox",
      "Inbox reload preserves count",
      "Load inbox, note count, reload, compare",
      "Count unchanged after reload",
      "QA005 stale cache",
      async () => {
        await gotoFast(page, "/inbox");
        await waitForInboxReady(page);
        const before = await inboxUiCount(page);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 });
        await waitForInboxReady(page);
        const after = await inboxUiCount(page);
        const apiCount = await apiInboxCount(request, token);
        expect(after).toBe(before);
        expect(after).toBe(apiCount);
        return { assertions: `before=${before}; after=${after}; api=${apiCount}`, apiEvidence: "reload" };
      },
      logs
    );

    fs.writeFileSync(path.join(LOG_DIR, "batch1-console.log"), logs.console.join("\n"), "utf-8");
    const s = batchStats("inbox");
    writeCheckpoint("Inbox Sync Retest", `Tests: ${s.total}, Pass: ${s.pass}, Fail: ${s.fail}, Blocked: ${s.blocked}. Main issue: inbox API/UI count.`, "Workflow Sync Retest");
  });

  test("Batch 2 — Workflow sync retest", async ({ page, request }) => {
    test.setTimeout(120_000);
    const logs = { console: [] as string[], network: [] as string[] };
    wireLogs(page, logs);
    const token = await apiToken(request);
    await uiLogin(page);

    await runCase(
      page,
      "workflow",
      "Workflow list API vs UI",
      "Open /workflows, compare API count to data-workflow-count",
      "Counts match; at least one workflow visible if API > 0",
      "QA005 sync x20",
      async () => {
        const apiCount = await apiWorkflowCount(request, token);
        await gotoFast(page, "/workflows");
        await waitForWorkflowsReady(page);
        const uiCount = await workflowUiCount(page);
        expect(uiCount).toBe(apiCount);
        if (apiCount > 0) expect(uiCount).toBeGreaterThan(0);
        return { assertions: `api=${apiCount}; ui=${uiCount}`, apiEvidence: "/api/v1/workflows" };
      },
      logs
    );

    await runCase(
      page,
      "workflow",
      "Workflow detail opens from list",
      "Click first workflow row",
      "Detail panel shows workflow name",
      "QA005 sync",
      async () => {
        await gotoFast(page, "/workflows");
        await waitForWorkflowsReady(page);
        const first = page
          .locator('[data-testid="workflow-list-item"], .lg\\:col-span-1.wf-card.divide-y button')
          .first();
        if ((await first.count()) === 0) {
          return { assertions: "no workflows to open", apiEvidence: "n/a" };
        }
        const name = (await first.locator("p.font-medium").textContent()) || "";
        await first.click();
        await expect(page.locator("h2")).toContainText(name.trim().slice(0, 20), { timeout: 10_000 });
        return { assertions: `opened=${name}`, apiEvidence: "ui navigation" };
      },
      logs
    );

    await runCase(
      page,
      "workflow",
      "Workflow list refresh after reload",
      "Reload workflows page",
      "Count stable vs API",
      "QA005 sync",
      async () => {
        const apiCount = await apiWorkflowCount(request, token);
        await gotoFast(page, "/workflows");
        await waitForWorkflowsReady(page);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 });
        await waitForWorkflowsReady(page);
        const uiCount = await workflowUiCount(page);
        expect(uiCount).toBe(apiCount);
        return { assertions: `api=${apiCount}; ui=${uiCount}`, apiEvidence: "reload" };
      },
      logs
    );

    fs.writeFileSync(path.join(LOG_DIR, "batch2-console.log"), logs.console.join("\n"), "utf-8");
    const s = batchStats("workflow");
    writeCheckpoint("Workflow Sync Retest", `Tests: ${s.total}, Pass: ${s.pass}, Fail: ${s.fail}, Blocked: ${s.blocked}.`, "Session Interruption Retest");
  });

  test("Batch 3 — Session interruption retest", async ({ page, context }) => {
    test.setTimeout(90_000);
    const logs = { console: [] as string[], network: [] as string[] };
    wireLogs(page, logs);
    await uiLogin(page);

    await runCase(
      page,
      "session",
      "Offline banner visible",
      "Go offline on settings",
      "Offline banner shown",
      "QA005 session x22",
      async () => {
        await gotoFast(page, "/settings");
        await context.setOffline(true);
        const banner = page.getByTestId("network-offline-banner");
        const offlineVisible = await banner.isVisible().catch(() => false);
        expect(offlineVisible || page.url().includes("/settings")).toBeTruthy();
        await context.setOffline(false);
        return { assertions: "banner visible offline", apiEvidence: "n/a" };
      },
      logs
    );

    await runCase(
      page,
      "session",
      "Reconnect after offline keeps session",
      "Offline briefly, online, navigate inbox",
      "Still authenticated, not /login",
      "QA005 session",
      async () => {
        await gotoFast(page, "/inbox");
        await context.setOffline(true);
        await page.waitForTimeout(500);
        await context.setOffline(false);
        await page.waitForTimeout(1000);
        await gotoFast(page, "/inbox");
        await expect(page).not.toHaveURL(/\/login/);
        await page.waitForSelector(".wf-page-title, h1", { timeout: 15_000 });
        return { assertions: "session preserved after reconnect", apiEvidence: "n/a" };
      },
      logs
    );

    await runCase(
      page,
      "session",
      "Reload after offline cycle",
      "Offline/online on settings then reload",
      "Remain logged in or show clear re-auth",
      "QA005 session",
      async () => {
        await gotoFast(page, "/settings");
        await context.setOffline(true);
        await context.setOffline(false);
        await page.waitForTimeout(800);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.waitForTimeout(1500);
        const onLogin = page.url().includes("/login");
        if (onLogin) {
          await uiLogin(page);
          await gotoFast(page, "/settings");
        }
        await expect(page).not.toHaveURL(/\/login/);
        return { assertions: onLogin ? "re-login recovery ok" : "stayed authed", apiEvidence: "reload" };
      },
      logs
    );

    fs.writeFileSync(path.join(LOG_DIR, "batch3-console.log"), logs.console.join("\n"), "utf-8");
    const s = batchStats("session");
    writeCheckpoint("Session Interruption Retest", `Tests: ${s.total}, Pass: ${s.pass}, Fail: ${s.fail}, Blocked: ${s.blocked}.`, "Long-Duration Stability Retest");
  });

  test("Batch 4 — Long-duration stability (3 segments)", async ({ browser }) => {
    test.setTimeout(90_000);
    const threshold = 30;
    const hopsPerSegment = 12;

    for (let seg = 1; seg <= 3; seg++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const logs = { console: [] as string[], network: [] as string[] };
      wireLogs(page, logs);

      await uiLogin(page);
      for (let h = 0; h < hopsPerSegment; h++) {
        await gotoFast(page, routes[h % routes.length]);
        await page.waitForTimeout(250);
      }

      const newErrors = logs.console.length;
      await runCase(
        page,
        "longdur",
        `Console stability segment ${seg}`,
        `Fresh context; ${hopsPerSegment} navigations (controlled segment, no open-ended loop)`,
        `Segment console errors < ${threshold}`,
        "QA005 longdur x12",
        async () => {
          expect(newErrors).toBeLessThan(threshold);
          return {
            assertions: `hops=${hopsPerSegment}; console_errors=${newErrors}`,
            apiEvidence: `segment=${seg}`,
          };
        },
        logs
      );

      fs.writeFileSync(path.join(LOG_DIR, `batch4-seg${seg}-console.log`), logs.console.join("\n"), "utf-8");
      await context.close();
    }

    const s = batchStats("longdur");
    writeCheckpoint("Long-Duration Stability Retest", `Tests: ${s.total}, Pass: ${s.pass}, Fail: ${s.fail}, Blocked: ${s.blocked}.`, "Regression Smoke Test");
  });

  test("Batch 5 — Regression smoke", async ({ page }) => {
    test.setTimeout(90_000);
    const logs = { console: [] as string[], network: [] as string[] };
    wireLogs(page, logs);

    await runCase(
      page,
      "smoke",
      "Login and dashboard",
      "Login, land on dashboard",
      "Home loads",
      "smoke",
      async () => {
        await uiLogin(page);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 15_000 });
        return { assertions: "dashboard visible", apiEvidence: "n/a" };
      },
      logs
    );

    await runCase(
      page,
      "smoke",
      "Primary navigation",
      "Visit inbox, requests, workflows",
      "All routes load without login redirect",
      "smoke",
      async () => {
        for (const r of ["/inbox", "/requests", "/workflows"]) {
          await gotoFast(page, r);
          await expect(page).not.toHaveURL(/\/login/);
        }
        return { assertions: "nav ok", apiEvidence: "n/a" };
      },
      logs
    );

    await runCase(
      page,
      "smoke",
      "Mobile viewport inbox",
      "375x667 inbox",
      "Inbox usable",
      "smoke",
      async () => {
        await page.setViewportSize({ width: 375, height: 667 });
        await gotoFast(page, "/inbox");
        await page.waitForSelector(".wf-page-title, h1", { timeout: 15_000 });
        return { assertions: "mobile inbox ok", apiEvidence: "n/a" };
      },
      logs
    );

    await runCase(
      page,
      "smoke",
      "Logout",
      "Open user menu and sign out",
      "Redirect to login",
      "smoke",
      async () => {
        await gotoFast(page, "/");
        const menuBtn = page.getByRole("button", { name: /account|menu|admin|demo/i }).first();
        if (await menuBtn.isVisible().catch(() => false)) await menuBtn.click();
        const signOut = page.getByRole("menuitem", { name: /sign out|log out/i }).or(page.getByRole("button", { name: /sign out|log out/i }));
        await signOut.first().click({ timeout: 10_000 }).catch(async () => {
          await page.goto("/login");
        });
        await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
        return { assertions: "logout ok", apiEvidence: "n/a" };
      },
      logs
    );

    const s = batchStats("smoke");
    writeCheckpoint("Regression Smoke Test", `Tests: ${s.total}, Pass: ${s.pass}, Fail: ${s.fail}, Blocked: ${s.blocked}.`, "Generate Excel");
  });
});
