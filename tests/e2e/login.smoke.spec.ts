import { test, expect } from "@playwright/test";

test.describe("Login page smoke", () => {
  test("shows sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });
});
