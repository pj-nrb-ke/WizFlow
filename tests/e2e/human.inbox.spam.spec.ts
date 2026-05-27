import { test, expect } from "@playwright/test";
import { captureConsole, humanPause, loginAsDemoAdmin, rand } from "./human.utils";

test.describe("Human-centric: inbox spam + multi-tab", () => {
  test("open inbox, spam clicks, attempt approve, second tab", async ({ page, context }) => {
    const c = await captureConsole(page);
    await loginAsDemoAdmin(page);

    await page.goto("/inbox");
    await humanPause(page, 200, 600);

    // Click first few inbox items rapidly (if any)
    const listButtons = page.locator("button").filter({ hasText: /WF-|WZ-|REQ-|[A-Z]{2,}\-/ }).first();
    if (await listButtons.count()) {
      for (let i = 0; i < 5; i++) {
        await listButtons.click({ delay: rand(10, 80) });
        await humanPause(page, 20, 120);
      }
    }

    // Approve spam: should be guarded by busy state
    const approve = page.getByRole("button", { name: /approve/i });
    if (await approve.count()) {
      for (let i = 0; i < 4; i++) {
        await approve.click({ delay: rand(5, 30) });
        await humanPause(page, 10, 60);
      }
    }

    // Multi-tab behavior
    const tab2 = await context.newPage();
    await tab2.goto("/inbox");
    await tab2.waitForTimeout(500);
    await tab2.screenshot({ path: "test-results/human-inbox-tab2.png", fullPage: true });
    await tab2.close();

    await page.screenshot({ path: "test-results/human-inbox-main.png", fullPage: true });

    const logs = c.stop();
    expect(logs.filter((x) => x.includes("[pageerror]")).length, `page errors:\n${logs.join("\n")}`).toBe(0);
  });
});

