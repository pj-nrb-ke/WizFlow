import { expect, Page } from "@playwright/test";

export function rand(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

export async function humanPause(page: Page, minMs = 40, maxMs = 280): Promise<void> {
  await page.waitForTimeout(rand(minMs, maxMs));
}

export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  const el = page.locator(selector);
  await el.click({ delay: rand(10, 60) });
  await humanPause(page);
  await el.fill("");
  for (const ch of text) {
    await el.type(ch, { delay: rand(20, 140) });
  }
  await humanPause(page);
}

export async function loginAsDemoAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await humanType(page, "#email", "admin@demo.wizflow.biz");
  await humanType(page, "#password", "changeme");
  await page.getByRole("button", { name: /sign in/i }).click({ delay: rand(20, 140) });
  await page.waitForURL(/\/($|#|\?)/, { timeout: 45_000 });
}

export async function captureConsole(page: Page): Promise<{ stop: () => string[] }> {
  const logs: string[] = [];
  const onConsole = (msg: any) => {
    logs.push(`[console.${msg.type?.() ?? "log"}] ${msg.text?.() ?? String(msg)}`);
  };
  const onPageError = (err: any) => {
    logs.push(`[pageerror] ${err?.message ?? String(err)}`);
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  return {
    stop: () => {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      return logs;
    },
  };
}

