import { APIRequestContext, Page, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export const API_BASE = process.env.PLAYWRIGHT_API_URL || "https://api.wizflow.biz";
export const OUT_DIR = path.resolve("..", "..", "docs", "qa-reports", "wiz-qa-005");
export const SHOT_DIR = path.join(OUT_DIR, "screenshots");
export const FAIL_DIR = path.join(OUT_DIR, "failures");
export const LOG_DIR = path.join(OUT_DIR, "logs");
export const CASES_PATH = path.join(OUT_DIR, "cases.json");

export type Category =
  | "interaction"
  | "assertion"
  | "duplicate"
  | "race"
  | "multitab"
  | "session"
  | "sync"
  | "destructive"
  | "mobile"
  | "nav"
  | "longdur";

export type CaseRow = {
  id: string;
  category: Category;
  page: string;
  scenario: string;
  steps: string;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL" | "BLOCKED";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "—";
  assertions: string;
  screenshot: string;
  apiEvidence: string;
  notes: string;
};

export function ensureDirs(): void {
  for (const d of [OUT_DIR, SHOT_DIR, FAIL_DIR, LOG_DIR]) fs.mkdirSync(d, { recursive: true });
}

export function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const NAV_MS = 15_000;

export async function hp(page: Page, min = 20, max = 120): Promise<void> {
  await page.waitForTimeout(rand(min, max));
}

export async function gotoFast(page: Page, route: string): Promise<void> {
  page.setDefaultNavigationTimeout(NAV_MS);
  await page.goto(route, { waitUntil: "domcontentloaded", timeout: NAV_MS });
}

export async function uiLogin(page: Page): Promise<void> {
  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible({ timeout: 30_000 });
  await page.locator("#email").fill("admin@demo.wizflow.biz");
  await page.locator("#password").fill("changeme");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 45_000 });
  await hp(page, 400, 800);
}

export async function apiToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { email: "admin@demo.wizflow.biz", password: "changeme" },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.access_token as string;
}

export async function apiGet<T>(request: APIRequestContext, token: string, path: string): Promise<T> {
  const res = await request.get(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as T;
}

export async function countUiInboxItems(page: Page): Promise<number> {
  const items = page.locator("div.lg\\:col-span-1 button.w-full");
  return items.count();
}
