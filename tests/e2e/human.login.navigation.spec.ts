import { test, expect } from "@playwright/test";
import { captureConsole, humanPause, loginAsDemoAdmin, rand } from "./human.utils";

test.describe("Human-centric: login + navigation chaos", () => {
  test("login, rapid nav, resize, back/forward", async ({ page }) => {
    const c = await captureConsole(page);

    await loginAsDemoAdmin(page);

    // Chaotic nav
    const routes = ["/inbox", "/workflows", "/requests", "/analytics", "/settings", "/reports", "/templates"];
    for (let i = 0; i < 10; i++) {
      const r = routes[Math.floor(Math.random() * routes.length)];
      await page.goto(r);
      await humanPause(page, 50, 250);
      await page.setViewportSize({ width: rand(360, 1360), height: rand(640, 980) });
      await humanPause(page, 30, 150);
    }

    // Back/forward abuse
    await page.goBack();
    await humanPause(page);
    await page.goForward();
    await humanPause(page);

    await page.screenshot({ path: "test-results/human-login-navigation.png", fullPage: true });

    const logs = c.stop();
    expect(logs.filter((x) => x.includes("[pageerror]")).length, `page errors:\n${logs.join("\n")}`).toBe(0);
  });
});

