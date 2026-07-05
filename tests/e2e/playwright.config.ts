import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 90_000,
  retries: 1,
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5200",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Bound individual actions/navigations. Without these, Playwright's default
    // (no per-action timeout) lets a stuck locator wait out the entire test
    // budget — which for qa005 is 1h via describe.configure — so a single
    // non-actionable element hangs the whole suite instead of failing the case.
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  webServer:
    process.env.CI || process.env.PLAYWRIGHT_BASE_URL?.includes("wizflow.biz")
      ? undefined
      : {
          command: "npm run dev",
          cwd: "../../apps/web",
          port: 5200,
          reuseExistingServer: true,
        },
});
