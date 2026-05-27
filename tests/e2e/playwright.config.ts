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
