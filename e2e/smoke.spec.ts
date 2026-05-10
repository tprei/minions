import { test, expect } from "@playwright/test";

test("app mounts and shows empty workflow list", async ({ page }) => {
  await page.route("**/workflows*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    }),
  );

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Minions" })).toBeVisible();
  await expect(page.getByText("No active workflows.", { exact: false })).toBeVisible();
});
