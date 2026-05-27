import { defineConfig } from "@playwright/test";

/** QA-006: short timeouts so batches cannot hang the IDE or terminal. */
export default defineConfig({
  testDir: ".",
  testMatch: "qa006.batches.spec.ts",
  timeout: 90_000,
  retries: 0,
  workers: 1,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "https://app.wizflow.biz",
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
