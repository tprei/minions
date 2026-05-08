import { test, expect } from "@playwright/test";

test("home page renders empty state", async ({ page }) => {
  await page.route("**/workflows*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    })
  );

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Minions" })).toBeVisible();
  await expect(page.getByText("No active workflows.", { exact: false })).toBeVisible();

  await expect(page).toHaveScreenshot("home-empty.png", {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
});
