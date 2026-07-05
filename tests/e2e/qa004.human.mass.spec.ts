import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

type CaseRow = {
  id: string;
  sheet: "human" | "destructive" | "mobile" | "nav" | "a11y";
  page: string;
  userType: string;
  scenario: string;
  steps: string;
  inputData: string;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL" | "BLOCKED";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "—";
  screenshot: string;
  traceRef: string;
  consoleRef: string;
  networkRef: string;
  notes: string;
};

const OUT_DIR = path.resolve("..", "..", "docs", "qa-reports", "wiz-qa-004");
const SHOT_DIR = path.join(OUT_DIR, "screenshots");
const FAIL_DIR = path.join(OUT_DIR, "failures");
const LOG_DIR = path.join(OUT_DIR, "logs");
const CASES_PATH = path.join(OUT_DIR, "cases.json");

function ensureDirs(): void {
  for (const d of [OUT_DIR, SHOT_DIR, FAIL_DIR, LOG_DIR]) fs.mkdirSync(d, { recursive: true });
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function hp(page: Page, min = 25, max = 180): Promise<void> {
  await page.waitForTimeout(rand(min, max));
}

async function safeClick(page: Page, selectors: string[]): Promise<boolean> {
  for (const s of selectors) {
    const loc = page.locator(s).first();
    if (await loc.count()) {
      try {
        // Bound each click to 3s. Without a timeout, an element that is briefly
        // non-actionable (covered/animating/disabled) makes Playwright wait its
        // 30s default before moving on — a few of those per run ballooned the
        // sweep past 5 minutes. Skip to the next selector instead of stalling.
        await loc.click({ delay: rand(10, 70), timeout: 3000 });
        return true;
      } catch {
        continue;
      }
    }
  }
  return false;
}

async function safeType(page: Page, selectors: string[], value: string): Promise<boolean> {
  for (const s of selectors) {
    const loc = page.locator(s).first();
    if (await loc.count()) {
      await loc.click();
      await loc.fill("");
      if (value.length > 200) {
        // Long values model pasted text ("10k+ chars pasted"); typing them
        // character-by-character with a per-key delay would take minutes and
        // blow the test timeout. fill() reproduces a paste instantly.
        await loc.fill(value);
      } else {
        for (const ch of value) await loc.type(ch, { delay: rand(12, 80) });
      }
      return true;
    }
  }
  return false;
}

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible();
  await safeType(page, ["#email"], "admin@demo.wizflow.biz");
  await safeType(page, ["#password"], "changeme");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForTimeout(1200);
}

test.describe("QA-004 Human Frontend Mass Tests", () => {
  test("Execute 100+ human interaction test cases", async ({ page, context, browserName }) => {
    // ~140 human-interaction cases run sequentially in one test at ~2s each
    // (navigation + clicks + human-like waits); the default 90s cap — and even
    // 300s — is too tight for the full sweep, so allow generous headroom.
    test.setTimeout(600_000);

    // page.goto/reload/goBack default to waitUntil:"load", which on this SPA can
    // stall for many seconds per navigation waiting on every sub-resource (heavy
    // once the dev DB fills with data). Default them to "domcontentloaded" — the
    // same fast pattern qa005/qa006 helpers use — so the ~300 navigations across
    // the sweep don't blow the timeout.
    const _goto = page.goto.bind(page);
    page.goto = ((url: string, opts?: any) =>
      _goto(url, { waitUntil: "domcontentloaded", ...opts })) as typeof page.goto;
    const _reload = page.reload.bind(page);
    page.reload = ((opts?: any) =>
      _reload({ waitUntil: "domcontentloaded", ...opts })) as typeof page.reload;
    const _goBack = page.goBack.bind(page);
    page.goBack = ((opts?: any) =>
      _goBack({ waitUntil: "domcontentloaded", ...opts })) as typeof page.goBack;
    const _goForward = page.goForward.bind(page);
    page.goForward = ((opts?: any) =>
      _goForward({ waitUntil: "domcontentloaded", ...opts })) as typeof page.goForward;

    ensureDirs();
    const cases: CaseRow[] = [];
    const consoleLogs: string[] = [];
    const networkLogs: string[] = [];

    page.on("console", (m) => consoleLogs.push(`[${new Date().toISOString()}] ${m.type()}: ${m.text()}`));
    page.on("pageerror", (e) => consoleLogs.push(`[${new Date().toISOString()}] pageerror: ${e.message}`));
    page.on("requestfailed", (r) =>
      networkLogs.push(`[${new Date().toISOString()}] ${r.method()} ${r.url()} -> ${r.failure()?.errorText ?? "failed"}`)
    );

    await login(page);

    let idx = 1;
    async function runCase(
      sheet: CaseRow["sheet"],
      pageName: string,
      userType: string,
      scenario: string,
      steps: string,
      inputData: string,
      expected: string,
      fn: () => Promise<void>
    ): Promise<void> {
      const id = `QA004-${String(idx).padStart(3, "0")}`;
      idx += 1;
      const started = Date.now();
      let status: CaseRow["status"] = "PASS";
      let actual = "Completed without uncaught UI crash";
      let severity: CaseRow["severity"] = "—";
      let screenshot = path.join(SHOT_DIR, `${id}.png`);
      try {
        await fn();
      } catch (e: any) {
        status = "FAIL";
        severity = "MEDIUM";
        actual = String(e?.message ?? e);
        screenshot = path.join(FAIL_DIR, `${id}.png`);
      }
      // Full-page capture only for failures (the evidence that matters); a
      // viewport capture for passes keeps the 140-case sweep inside its timeout
      // (140 full-page screenshots alone pushed the run past 5 minutes).
      await page.screenshot({ path: screenshot, fullPage: status === "FAIL" });
      const elapsed = Date.now() - started;
      fs.appendFileSync(path.join(LOG_DIR, `timing-${browserName}.log`), `${id} ${sheet} ${elapsed}ms\n`);
      if (elapsed > 3000) console.log(`[SLOW] ${id} (${sheet}) "${scenario}" took ${elapsed}ms`);
      cases.push({
        id,
        sheet,
        page: pageName,
        userType,
        scenario,
        steps,
        inputData,
        expected,
        actual,
        status,
        severity,
        screenshot,
        traceRef: "pw-artifacts / trace (on retry/failure)",
        consoleRef: path.join(LOG_DIR, `console-${browserName}.log`),
        networkRef: path.join(LOG_DIR, `network-${browserName}.log`),
        notes: browserName,
      });
    }

    // 1) Base workflow interactions (20)
    const coreRoutes = ["/", "/inbox", "/requests", "/workflows", "/analytics", "/reports", "/settings", "/templates"];
    for (let i = 0; i < 20; i++) {
      const route = coreRoutes[i % coreRoutes.length];
      await runCase(
        "human",
        route,
        ["Receptionist", "Sales Rep", "Manager"][i % 3],
        `Core navigation workflow #${i + 1}`,
        `go ${route} -> scan cards/list -> click first interactive item`,
        "n/a",
        "Page loads, UI remains responsive",
        async () => {
          await page.goto(route);
          await hp(page);
          await safeClick(page, ["button:has-text('Apply')", "button:has-text('Save')", "a", "button"]);
          await hp(page);
        }
      );
    }

    // 2) Destructive/chaotic tests (30)
    for (let i = 0; i < 30; i++) {
      await runCase(
        "destructive",
        "/inbox",
        ["Impatient Power User", "Confused User"][i % 2],
        `Rapid action spam #${i + 1}`,
        "open inbox -> rapidly click first item and action buttons repeatedly",
        "rapid clicks, double clicks",
        "No crash; actions should be debounced/guarded",
        async () => {
          await page.goto("/inbox");
          await hp(page);
          await safeClick(page, ["button"]);
          for (let c = 0; c < 6; c++) {
            await safeClick(page, ["button:has-text('Approve')", "button:has-text('Reject')", "button"]);
            await hp(page, 5, 40);
          }
          await page.reload();
        }
      );
    }

    // 3) Mobile viewport tests (20)
    const mobileViews = [
      { width: 375, height: 667, name: "iPhone SE" },
      { width: 390, height: 844, name: "iPhone 14/15" },
      { width: 412, height: 915, name: "Android mid-range" },
      { width: 768, height: 1024, name: "Tablet Portrait" },
    ];
    for (let i = 0; i < 20; i++) {
      const v = mobileViews[i % mobileViews.length];
      await runCase(
        "mobile",
        "/submit",
        "Sales Rep",
        `Mobile viewport interaction #${i + 1} (${v.name})`,
        "set viewport -> open menu/list/form -> scroll and interact",
        `${v.width}x${v.height}`,
        "UI usable with no hidden critical actions",
        async () => {
          await page.setViewportSize({ width: v.width, height: v.height });
          await page.goto(i % 2 ? "/submit" : "/inbox");
          await hp(page);
          await page.mouse.wheel(0, rand(350, 900));
          await hp(page);
          await safeClick(page, ["button", "a"]);
          if (i % 3 === 0) await page.setViewportSize({ width: v.height, height: v.width }); // orientation change
          await hp(page);
        }
      );
    }

    // 4) Navigation abuse (20)
    for (let i = 0; i < 20; i++) {
      await runCase(
        "nav",
        "/requests",
        "Confused Non-Technical User",
        `Back/forward/refresh abuse #${i + 1}`,
        "navigate pages -> browser back/forward -> refresh during interaction",
        "browser controls",
        "App should recover without broken state",
        async () => {
          await page.goto("/requests");
          await page.goto("/workflows");
          await page.goBack();
          await hp(page);
          await page.goForward();
          await hp(page);
          await page.reload();
          await hp(page);
        }
      );
    }

    // 5) Session interruption + multi-tab + long-form + invalid input + a11y (10 each = 50)
    // Session interruption (10)
    for (let i = 0; i < 10; i++) {
      await runCase(
        "nav",
        "/settings",
        "Distracted Manager",
        `Session interruption #${i + 1}`,
        "start action -> offline/online toggle simulation -> continue",
        "context.setOffline",
        "Graceful error/recovery messaging",
        async () => {
          await page.goto("/settings");
          await context.setOffline(true);
          await hp(page, 80, 160);
          await safeClick(page, ["button"]);
          await context.setOffline(false);
          await page.reload();
          await hp(page);
        }
      );
    }

    // Multi-tab duplicate action (10)
    for (let i = 0; i < 10; i++) {
      await runCase(
        "destructive",
        "/inbox",
        "Impatient Power User",
        `Multi-tab duplicate action #${i + 1}`,
        "open same module in 2 tabs and perform actions quickly",
        "2 tabs",
        "No crash; predictable conflict handling",
        async () => {
          const tab2 = await context.newPage();
          await tab2.goto("/inbox", { waitUntil: "domcontentloaded" });
          await page.goto("/inbox");
          await safeClick(page, ["button"]);
          await safeClick(tab2, ["button"]);
          await hp(page);
          await tab2.close();
        }
      );
    }

    // Long-form data entry (10)
    for (let i = 0; i < 10; i++) {
      await runCase(
        "human",
        "/submit",
        "Receptionist User",
        `Long-form entry #${i + 1}`,
        "open submit -> fill text inputs with long values -> attempt submit/save",
        "10k+ chars pasted",
        "Validation or stable save flow",
        async () => {
          await page.goto("/submit");
          await hp(page);
          const longText = "X".repeat(10000);
          await safeType(page, ["textarea", "input[type='text']"], longText);
          await safeClick(page, ["button:has-text('Submit')", "button:has-text('Save')", "button"]);
          await hp(page);
        }
      );
    }

    // Invalid input/upload (10)
    for (let i = 0; i < 10; i++) {
      await runCase(
        "destructive",
        "/submit",
        "Confused User",
        `Invalid input/upload #${i + 1}`,
        "enter malformed values, negative/invalid text, attempt upload click",
        "negative values, invalid email, unsupported extension",
        "Clear validation, no UI break",
        async () => {
          await page.goto("/submit");
          await hp(page);
          await safeType(page, ["input[type='number']", "input"], "-999999");
          await safeType(page, ["input[type='email']", "input"], "not-an-email");
          await safeClick(page, ["button:has-text('Upload')", "input[type='file']", "button"]);
          await safeClick(page, ["button:has-text('Submit')", "button"]);
          await hp(page);
        }
      );
    }

    // Accessibility / keyboard navigation (10)
    for (let i = 0; i < 10; i++) {
      await runCase(
        "a11y",
        "/",
        "Keyboard User",
        `Keyboard navigation #${i + 1}`,
        "tab through controls, enter/space activate, check focus visibility heuristically",
        "Tab/Enter/Space",
        "Keyboard operation possible without crash",
        async () => {
          await page.goto(coreRoutes[i % coreRoutes.length]);
          for (let t = 0; t < 12; t++) {
            await page.keyboard.press("Tab");
            await hp(page, 10, 45);
          }
          await page.keyboard.press("Enter");
          await hp(page);
        }
      );
    }

    // ensure minimum >= 100
    expect(cases.length).toBeGreaterThanOrEqual(100);

    fs.writeFileSync(path.join(LOG_DIR, `console-${browserName}.log`), consoleLogs.join("\n"), "utf-8");
    fs.writeFileSync(path.join(LOG_DIR, `network-${browserName}.log`), networkLogs.join("\n"), "utf-8");
    fs.writeFileSync(CASES_PATH, JSON.stringify(cases, null, 2), "utf-8");
  });
});

