import { APIRequestContext, Page, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export const API_BASE = process.env.PLAYWRIGHT_API_URL || "https://api.wizflow.biz";
export const OUT_DIR = path.resolve("..", "..", "docs", "qa-reports", "wiz-qa-006");
export const FAIL_DIR = path.join(OUT_DIR, "failures");
export const LOG_DIR = path.join(OUT_DIR, "logs");
export const CASES_PATH = path.join(OUT_DIR, "cases.json");
export const CHECKPOINT_PATH = path.join(OUT_DIR, "checkpoints.md");

export const TEST_MS = 30_000;
export const NAV_MS = 20_000;
export const BATCH_MS = 15 * 60_000;
/** Per QA-006 doc: 5-minute segments; use env override for faster local runs. */
export const SEGMENT_MS = Number(process.env.QA006_SEGMENT_MS || 5 * 60_000);

export type BatchName =
  | "inbox"
  | "workflow"
  | "session"
  | "longdur"
  | "smoke";

export type Qa006Case = {
  id: string;
  batch: BatchName;
  scenario: string;
  steps: string;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL" | "BLOCKED";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "—";
  url: string;
  assertions: string;
  apiEvidence: string;
  screenshot: string;
  consoleLog: string;
  networkLog: string;
  probableCause: string;
  suggestedFix: string;
  qa005Ref: string;
};

let cases: Qa006Case[] = [];
let idSeq = 1;

export function ensureDirs(): void {
  for (const d of [OUT_DIR, FAIL_DIR, LOG_DIR]) fs.mkdirSync(d, { recursive: true });
}

export function loadCases(): void {
  if (fs.existsSync(CASES_PATH)) {
    cases = JSON.parse(fs.readFileSync(CASES_PATH, "utf-8")) as Qa006Case[];
    const nums = cases.map((c) => parseInt(c.id.replace(/\D/g, ""), 10)).filter((n) => !Number.isNaN(n));
    idSeq = nums.length ? Math.max(...nums) + 1 : 1;
  }
}

export function persistCases(): void {
  fs.writeFileSync(CASES_PATH, JSON.stringify(cases, null, 2), "utf-8");
}

export function writeCheckpoint(batch: string, summary: string, next: string): void {
  const line = `QA-006 Checkpoint: ${batch} completed. ${summary} Next: ${next}.\n`;
  fs.appendFileSync(CHECKPOINT_PATH, line, "utf-8");
  console.log(line.trim());
}

export async function gotoFast(page: Page, route: string): Promise<void> {
  page.setDefaultNavigationTimeout(NAV_MS);
  await page.goto(route, { waitUntil: "domcontentloaded", timeout: NAV_MS });
}

export async function waitForInboxReady(page: Page): Promise<void> {
  if (page.url().includes("/login")) throw new Error("Not logged in — still on /login");
  await page.waitForSelector(".wf-page-title, h1", { timeout: 15_000 });
  await page.waitForTimeout(1500);
}

export async function waitForWorkflowsReady(page: Page): Promise<void> {
  if (page.url().includes("/login")) throw new Error("Not logged in — still on /login");
  await page.waitForSelector("h1", { timeout: 15_000 });
  await page.waitForTimeout(1500);
}

export async function inboxUiCount(page: Page): Promise<number> {
  const items = page.getByTestId("inbox-list-item");
  const n = await items.count();
  if (n > 0) return n;
  const attrLoc = page.locator("[data-inbox-count]");
  if ((await attrLoc.count()) > 0) {
    const attr = await attrLoc.getAttribute("data-inbox-count");
    if (attr) return parseInt(attr, 10);
  }
  const subtitle = await page.locator(".wf-page-subtitle").textContent().catch(() => "");
  const m = subtitle?.match(/(\d+)\s+pending/);
  if (m) return parseInt(m[1], 10);
  const empty = await page.locator("text=No pending approvals").count();
  if (empty > 0) return 0;
  return page
    .locator(".wf-card.divide-y")
    .first()
    .locator('button[type="button"]')
    .filter({ has: page.locator("p.font-medium") })
    .count();
}

export async function workflowUiCount(page: Page): Promise<number> {
  const items = page.getByTestId("workflow-list-item");
  const n = await items.count();
  if (n > 0) return n;
  const attrLoc = page.locator("[data-workflow-count]");
  if ((await attrLoc.count()) > 0) {
    const attr = await attrLoc.getAttribute("data-workflow-count");
    if (attr) return parseInt(attr, 10);
  }
  const empty = await page.locator("text=No workflows yet").count();
  if (empty > 0) return 0;
  return page
    .locator(".wf-card.divide-y")
    .first()
    .locator('button[type="button"]')
    .filter({ has: page.locator("p.font-medium") })
    .count();
}

export async function uiLogin(page: Page): Promise<void> {
  await gotoFast(page, "/login");
  await expect(page.locator("#email")).toBeVisible({ timeout: 15_000 });
  await page.locator("#email").fill("admin@demo.wizflow.biz");
  await page.locator("#password").fill("changeme");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 45_000 });
  await expect(page).not.toHaveURL(/\/login/);
}

export async function apiToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { email: "admin@demo.wizflow.biz", password: "changeme" },
    timeout: 15_000,
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.access_token as string;
}

export async function apiInboxCount(request: APIRequestContext, token: string, qs = "limit=100"): Promise<number> {
  const res = await request.get(`${API_BASE}/api/v1/inbox?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15_000,
  });
  expect(res.ok()).toBeTruthy();
  const data = (await res.json()) as unknown[];
  return data.length;
}

export async function apiWorkflowCount(request: APIRequestContext, token: string): Promise<number> {
  const res = await request.get(`${API_BASE}/api/v1/workflows`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15_000,
  });
  expect(res.ok()).toBeTruthy();
  const data = (await res.json()) as unknown[];
  return data.length;
}

export async function runCase(
  page: Page,
  batch: BatchName,
  scenario: string,
  steps: string,
  expected: string,
  qa005Ref: string,
  fn: () => Promise<{ assertions: string; apiEvidence: string }>,
  logs: { console: string[]; network: string[] }
): Promise<void> {
  const id = `QA006-${String(idSeq).padStart(3, "0")}`;
  idSeq += 1;
  let status: Qa006Case["status"] = "PASS";
  let severity: Qa006Case["severity"] = "—";
  let actual = "OK";
  let assertions = "";
  let apiEvidence = "";
  let screenshot = "";
  let probableCause = "";
  let suggestedFix = "";
  try {
    const out = await fn();
    assertions = out.assertions;
    apiEvidence = out.apiEvidence;
  } catch (e: unknown) {
    status = "FAIL";
    severity = batch === "inbox" || batch === "workflow" ? "HIGH" : "MEDIUM";
    actual = e instanceof Error ? e.message : String(e);
    probableCause = actual.slice(0, 200);
    suggestedFix = "See QA-006 Fix Recommendations sheet";
    screenshot = path.join(FAIL_DIR, `${id}.png`);
    try {
      await page.screenshot({ path: screenshot, fullPage: false });
    } catch {
      screenshot = "";
    }
  }
  cases.push({
    id,
    batch,
    scenario,
    steps,
    expected,
    actual: actual.replace(/\x1b\[[0-9;]*m/g, ""),
    status,
    severity,
    url: page.url(),
    assertions,
    apiEvidence,
    screenshot,
    consoleLog: logs.console.slice(-20).join("\n"),
    networkLog: logs.network.slice(-20).join("\n"),
    probableCause,
    suggestedFix,
    qa005Ref,
  });
  persistCases();
}

export function batchStats(batch: BatchName): { total: number; pass: number; fail: number; blocked: number } {
  const b = cases.filter((c) => c.batch === batch);
  return {
    total: b.length,
    pass: b.filter((c) => c.status === "PASS").length,
    fail: b.filter((c) => c.status === "FAIL").length,
    blocked: b.filter((c) => c.status === "BLOCKED").length,
  };
}

export function wireLogs(page: Page, logs: { console: string[]; network: string[] }): void {
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") logs.console.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => logs.console.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) logs.network.push(`${r.request().method()} ${r.url()} -> ${r.status()}`);
  });
}

export function getCases(): Qa006Case[] {
  return cases;
}
