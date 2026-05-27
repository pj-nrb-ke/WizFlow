import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5200",
    trace: "on-first-retry",
  },
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        cwd: "../../apps/web",
        port: 5200,
        reuseExistingServer: true,
      },
});
