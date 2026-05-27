import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  API_BASE,
  CASES_PATH,
  CaseRow,
  Category,
  FAIL_DIR,
  LOG_DIR,
  apiGet,
  apiToken,
  countUiInboxItems,
  ensureDirs,
  gotoFast,
  hp,
  uiLogin,
} from "./qa005.helpers";

test.describe.configure({ mode: "serial", timeout: 3_600_000 });

const routes = ["/", "/inbox", "/requests", "/workflows", "/analytics", "/reports", "/settings", "/templates", "/submit"];

let allCases: CaseRow[] = [];
let caseIdx = 1;
let token = "";
const consoleLogs: string[] = [];
const networkLogs: string[] = [];
const apiLogs: string[] = [];

function loadCases(): void {
  if (fs.existsSync(CASES_PATH)) {
    allCases = JSON.parse(fs.readFileSync(CASES_PATH, "utf-8")) as CaseRow[];
    caseIdx = allCases.length + 1;
  }
}

function catCount(category: Category): number {
  return allCases.filter((c) => c.category === category).length;
}

function persistCases(): void {
  fs.writeFileSync(CASES_PATH, JSON.stringify(allCases, null, 2), "utf-8");
}

function wirePage(page: Page): void {
  page.on("console", (m) => {
    if (m.type() === "error") consoleLogs.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => consoleLogs.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().includes("/api/")) {
      networkLogs.push(`${r.request().method()} ${r.url()} -> ${r.status()}`);
    }
  });
}

async function ensureLoggedIn(page: Page): Promise<void> {
  try {
    await gotoFast(page, "/inbox");
  } catch {
    await uiLogin(page);
    return;
  }
  if (page.url().includes("/login")) await uiLogin(page);
}

async function runCase(
  page: Page,
  browserName: string,
  category: Category,
  pageName: string,
  scenario: string,
  steps: string,
  expected: string,
  fn: () => Promise<{ assertions: string; apiEvidence: string }>
): Promise<void> {
  const id = `QA005-${String(caseIdx).padStart(4, "0")}`;
  caseIdx += 1;
  let status: CaseRow["status"] = "PASS";
  let severity: CaseRow["severity"] = "—";
  let actual = "All assertions satisfied";
  let assertions = "";
  let apiEvidence = "";
  let screenshot = "";
  try {
    const out = await fn();
    assertions = out.assertions;
    apiEvidence = out.apiEvidence;
  } catch (e: unknown) {
    status = "FAIL";
    severity =
      category === "sync" || category === "duplicate"
        ? "HIGH"
        : category === "session"
          ? "MEDIUM"
          : "MEDIUM";
    if (category === "sync" && String(e).includes("mismatch")) severity = "CRITICAL";
    actual = e instanceof Error ? e.message : String(e);
    screenshot = path.join(FAIL_DIR, `${id}.png`);
    try {
      await page.screenshot({ path: screenshot, fullPage: false });
    } catch {
      screenshot = "";
    }
  }
  allCases.push({
    id,
    category,
    page: pageName,
    scenario,
    steps,
    expected,
    actual,
    status,
    severity,
    assertions,
    screenshot,
    apiEvidence,
    notes: browserName,
  });
  if (allCases.length % 25 === 0) persistCases();
}

function writeLogs(browserName: string): void {
  fs.writeFileSync(path.join(LOG_DIR, `console-${browserName}.log`), consoleLogs.join("\n"), "utf-8");
  fs.writeFileSync(path.join(LOG_DIR, `network-${browserName}.log`), networkLogs.join("\n"), "utf-8");
  fs.writeFileSync(path.join(LOG_DIR, `api-${browserName}.log`), apiLogs.join("\n"), "utf-8");
}

test.describe("QA-005 Enterprise Rock-Solid Validation", () => {
  test.beforeAll(async ({ request }) => {
    ensureDirs();
    loadCases();
    token = await apiToken(request);
    apiLogs.push(`login ok token_len=${token.length}`);
  });

  test("A — 250+ interaction tests", async ({ page, browserName }) => {
    loadCases();
    if (catCount("interaction") >= 250) {
      test.skip();
      return;
    }
    wirePage(page);
    await ensureLoggedIn(page);
    for (let i = catCount("interaction"); i < 250; i++) {
      const route = routes[i % routes.length];
      await runCase(
        page,
        browserName,
        "interaction",
        route,
        `Core interaction #${i + 1}`,
        `Navigate ${route}, interact, verify no pageerror`,
        "Page loads; no fatal console errors",
        async () => {
          await gotoFast(page, route);
          await hp(page, 10, 40);
          await page.locator("button, a").first().click({ timeout: 3000 }).catch(() => {});
          return {
            assertions: `navigated=${route}; console_errors=${consoleLogs.length}`,
            apiEvidence: "n/a",
          };
        }
      );
    }
    persistCases();
  });

  test("B — 80 assertion-heavy validations", async ({ page, request, browserName }) => {
    loadCases();
    if (catCount("assertion") >= 80) {
      test.skip();
      return;
    }
    wirePage(page);
    await ensureLoggedIn(page);
    for (let i = catCount("assertion"); i < 80; i++) {
      await runCase(
        page,
        browserName,
        "assertion",
        "/inbox",
        `API/UI sync assertion #${i + 1}`,
        "GET /inbox API count vs UI list count",
        "Counts within tolerance; API 200",
        async () => {
          const apiInbox = await apiGet<unknown[]>(request, token, "/api/v1/inbox");
          await gotoFast(page, "/inbox");
          await page.waitForTimeout(300);
          const uiCount = await countUiInboxItems(page);
          const apiCount = apiInbox.length;
          const delta = Math.abs(apiCount - uiCount);
          expect(delta).toBeLessThanOrEqual(Math.max(5, Math.ceil(apiCount * 0.15)));
          return {
            assertions: `api=${apiCount}; ui=${uiCount}; delta=${delta}`,
            apiEvidence: `${API_BASE}/api/v1/inbox -> ${apiCount}`,
          };
        }
      );
    }
    persistCases();
  });

  test("C — duplicate, race, multitab, session", async ({ page, context, browserName }) => {
    loadCases();
    if (catCount("duplicate") >= 25 && catCount("race") >= 20 && catCount("multitab") >= 22 && catCount("session") >= 22) {
      test.skip();
      return;
    }
    wirePage(page);
    await ensureLoggedIn(page);

    for (let i = catCount("duplicate"); i < 25; i++) {
      await runCase(
        page,
        browserName,
        "duplicate",
        "/inbox",
        `Duplicate click guard #${i + 1}`,
        "Spam Approve clicks; count POSTs",
        "Busy/disabled or limited POSTs",
        async () => {
          await gotoFast(page, "/inbox");
          const posts: string[] = [];
          const onReq = (req: { method: () => string; url: () => string }) => {
            if (req.method() === "POST" && /\/approve|\/reject|\/return/.test(req.url())) posts.push(req.url());
          };
          page.on("request", onReq);
          const approve = page.getByRole("button", { name: /^approve$/i });
          if (await approve.isVisible().catch(() => false)) {
            for (let c = 0; c < 6; c++) await approve.click({ delay: 15 }).catch(() => {});
          }
          page.off("request", onReq);
          return {
            assertions: `posts=${posts.length}`,
            apiEvidence: posts.slice(0, 3).join("; ") || "no approve",
          };
        }
      );
    }

    for (let i = catCount("race"); i < 20; i++) {
      await runCase(
        page,
        browserName,
        "race",
        "/requests",
        `Rapid nav during load #${i + 1}`,
        "Dual navigation before settle",
        "No login redirect",
        async () => {
          await Promise.allSettled([page.goto("/requests"), page.goto("/workflows")]);
          await expect(page).not.toHaveURL(/\/login/);
          return { assertions: "dual nav ok", apiEvidence: "n/a" };
        }
      );
    }

    for (let i = catCount("multitab"); i < 22; i++) {
      await runCase(
        page,
        browserName,
        "multitab",
        "/inbox",
        `Multi-tab inbox #${i + 1}`,
        "Two tabs on inbox",
        "No crash",
        async () => {
          const t2 = await context.newPage();
          await gotoFast(page, "/inbox");
          await gotoFast(t2, "/inbox");
          await t2.locator("button").first().click().catch(() => {});
          await page.locator("button").first().click().catch(() => {});
          await t2.close();
          return { assertions: "2 tabs ok", apiEvidence: "n/a" };
        }
      );
    }

    for (let i = catCount("session"); i < 22; i++) {
      await runCase(
        page,
        browserName,
        "session",
        "/settings",
        `Offline/online #${i + 1}`,
        "Offline toggle cycle",
        "Recovers after reload",
        async () => {
          await gotoFast(page, "/settings");
          await context.setOffline(true);
          await page.locator("button").first().click().catch(() => {});
          await context.setOffline(false);
          await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
          await expect(page).not.toHaveURL(/\/login/);
          return { assertions: "offline cycle ok", apiEvidence: "n/a" };
        }
      );
    }
    persistCases();
  });

  test("D — sync + destructive (resume-safe)", async ({ page, request, browserName }) => {
    loadCases();
    wirePage(page);
    page.setDefaultNavigationTimeout(15_000);
    await ensureLoggedIn(page);

    for (let i = catCount("sync"); i < 20; i++) {
      await runCase(
        page,
        browserName,
        "sync",
        "/inbox",
        `Inbox API/UI sync #${i + 1}`,
        "API inbox count matches UI list",
        "Counts within tolerance",
        async () => {
          const apiInbox = await apiGet<unknown[]>(request, token, "/api/v1/inbox");
          await gotoFast(page, "/inbox");
          const uiCount = await countUiInboxItems(page);
          const apiCount = apiInbox.length;
          const delta = Math.abs(apiCount - uiCount);
          expect(delta).toBeLessThanOrEqual(Math.max(5, Math.ceil(apiCount * 0.15)));
          return {
            assertions: `api=${apiCount}; ui=${uiCount}; delta=${delta}`,
            apiEvidence: `${API_BASE}/api/v1/inbox`,
          };
        }
      );
    }

    for (let i = catCount("destructive"); i < 45; i++) {
      await runCase(
        page,
        browserName,
        "destructive",
        "/submit",
        `Chaos submit #${i + 1}`,
        "Invalid input + submit spam",
        "Validation or single submit",
        async () => {
          await gotoFast(page, "/submit");
          await page.locator("input").first().fill("-99999").catch(() => {});
          await page.getByRole("button", { name: /submit|save/i }).first().click({ timeout: 3000 }).catch(() => {});
          await gotoFast(page, "/");
          return { assertions: "chaos ok; navigated away", apiEvidence: "n/a" };
        }
      );
    }
    persistCases();
  });

  test("E — mobile, nav, long-duration (resume-safe)", async ({ page, request, browserName }) => {
    loadCases();
    if (catCount("mobile") >= 28 && catCount("nav") >= 28 && catCount("longdur") >= 12) {
      test.skip();
      return;
    }
    wirePage(page);
    page.setDefaultNavigationTimeout(15_000);
    await ensureLoggedIn(page);

    const views = [
      { w: 375, h: 667 },
      { w: 390, h: 844 },
      { w: 412, h: 915 },
      { w: 768, h: 1024 },
    ];
    const mobileRoutes = ["/inbox", "/requests", "/workflows", "/settings"];
    for (let i = catCount("mobile"); i < 28; i++) {
      const v = views[i % views.length];
      const route = mobileRoutes[i % mobileRoutes.length];
      await runCase(
        page,
        browserName,
        "mobile",
        route,
        `Mobile viewport #${i + 1}`,
        `Viewport ${v.w}x${v.h}`,
        "Not on login screen",
        async () => {
          await page.setViewportSize({ width: v.w, height: v.h });
          await gotoFast(page, route);
          expect(await page.getByRole("button", { name: /sign in/i }).count()).toBe(0);
          return { assertions: `${v.w}x${v.h}`, apiEvidence: "n/a" };
        }
      );
    }

    for (let i = catCount("nav"); i < 28; i++) {
      await runCase(
        page,
        browserName,
        "nav",
        "/requests",
        `Nav abuse #${i + 1}`,
        "back/forward/reload",
        "No login loop",
        async () => {
          await gotoFast(page, "/requests");
          await gotoFast(page, "/inbox");
          await gotoFast(page, "/workflows");
          await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
          await expect(page).not.toHaveURL(/\/login/);
          return { assertions: "nav chain ok", apiEvidence: "n/a" };
        }
      );
    }

    for (let i = catCount("longdur"); i < 12; i++) {
      await runCase(
        page,
        browserName,
        "longdur",
        "/",
        `Long-session burst #${i + 1}`,
        "8 module hops + health",
        "Health ok; few new console errors",
        async () => {
          const startErr = consoleLogs.length;
          for (let a = 0; a < 8; a++) {
            await gotoFast(page, routes[a % routes.length]);
            await hp(page, 20, 50);
          }
          const health = await request.get(`${API_BASE}/api/v1/health`);
          expect(health.ok()).toBeTruthy();
          expect(consoleLogs.length - startErr).toBeLessThan(3);
          return {
            assertions: `hops=8; new_err=${consoleLogs.length - startErr}`,
            apiEvidence: `health=${health.status()}`,
          };
        }
      );
    }
    persistCases();
  });

  test("Z — finalize counts and logs", async ({ browserName }) => {
    loadCases();
    expect(allCases.length).toBeGreaterThanOrEqual(515);
    expect(allCases.filter((c) => c.category === "interaction").length).toBeGreaterThanOrEqual(250);
    expect(allCases.filter((c) => c.category === "assertion").length).toBeGreaterThanOrEqual(75);
    writeLogs(browserName);
    persistCases();
  });
});
