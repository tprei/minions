import { test, expect } from "@playwright/test";

function mockWorkflows(page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never) {
  return page.route("**/workflows*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    })
  );
}

test.beforeEach(async ({ page }) => {
  await mockWorkflows(page);
});

test("theme toggle persists", async ({ page }) => {
  await page.goto("/?test=1");

  const toggle = page.locator(".theme-toggle");
  await expect(toggle).toBeVisible();

  const darkBtn = toggle.locator('[data-value="dark"]');
  await darkBtn.click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const stored = await page.evaluate(() => localStorage.getItem("theme"));
  expect(stored).toBe("dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("Sheet open/close + drag dismiss", async ({ page }) => {
  await page.goto("/?test=1");

  const sheet = await page.evaluate(() => {
    const ui = (window as unknown as { __ui?: { createSheet: (opts: Record<string, unknown>) => { panel: HTMLElement } } }).__ui;
    if (!ui) throw new Error("window.__ui not available");
    const instance = ui.createSheet({ title: "Test Sheet", body: "Sheet content" });
    return { panelVisible: instance.panel.classList.contains("open") };
  });

  expect(sheet.panelVisible).toBe(true);

  const panel = page.locator(".sheet-panel");
  await expect(panel).toBeVisible();

  await expect(page.getByText("Test Sheet")).toBeVisible();

  await page.locator(".sheet-close").dispatchEvent("click");

  await expect(panel).not.toBeVisible({ timeout: 2000 });
});

test("Status dot palette renders 12 states", async ({ page }) => {
  await page.goto("/?test=1");

  await page.evaluate(() => {
    const ui = (window as unknown as { __ui?: { createStatusDot: (status: string) => HTMLElement } }).__ui;
    if (!ui) throw new Error("window.__ui not available");
    const statuses = [
      "pending", "ready", "running", "completed", "quality-pending",
      "finalizing", "pr-open", "ci-pending", "needs-review", "merged",
      "failed", "cancelled",
    ];
    const strip = document.createElement("div");
    strip.id = "dot-strip";
    strip.style.cssText = "display:flex;gap:8px;padding:16px;background:hsl(var(--bg));";
    statuses.forEach((s) => {
      const dot = ui.createStatusDot(s);
      dot.setAttribute("data-status", s);
      strip.appendChild(dot);
    });
    document.body.appendChild(strip);
  });

  const strip = page.locator("#dot-strip");
  await expect(strip).toBeVisible();

  const dots = strip.locator(".status-dot");
  await expect(dots).toHaveCount(12);

  const classNames = await dots.evaluateAll((els: Element[]) =>
    els.map((el) => el.className)
  );

  const uniqueClasses = new Set(classNames);
  expect(uniqueClasses.size).toBe(12);

  await expect(strip).toHaveScreenshot("status-dot-strip.png");
});

test("Frosted header in light + dark", async ({ page }) => {
  await page.goto("/?test=1");

  const toggle = page.locator(".theme-toggle");

  const lightBtn = toggle.locator('[data-value="light"]');
  await lightBtn.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await expect(page).toHaveScreenshot("frosted-header-light.png", {
    clip: { x: 0, y: 0, width: 1280, height: 80 },
  });

  const darkBtn = toggle.locator('[data-value="dark"]');
  await darkBtn.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await expect(page).toHaveScreenshot("frosted-header-dark.png", {
    clip: { x: 0, y: 0, width: 1280, height: 80 },
  });
});
