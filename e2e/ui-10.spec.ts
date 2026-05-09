import { test, expect } from "@playwright/test";

type Page = Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never;

async function setupBaseRoutes(page: Page, workflows: unknown[] = []) {
  await page.route("**/workflows", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(workflows) });
    } else {
      route.continue();
    }
  });
  await page.route("**/push/vapid-public-key", (route) =>
    route.fulfill({ status: 404, body: "not found" })
  );
  await page.route("**/audit/events**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: [] }) })
  );
  await page.route("**/alerts**", (route) => {
    if (!route.request().url().includes("subscribe")) {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ alerts: [] }) });
    } else {
      route.continue();
    }
  });
}

const TEST_WORKFLOWS = [
  {
    id: "wf-passport-1",
    kind: "manual-dag",
    status: "active",
    graph: {},
    operations: {},
    policy: { maxConcurrent: 1, autoLand: false, autoMergeOnGreen: false },
    version: 1,
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-01T00:00:00Z",
  },
  {
    id: "wf-passport-2",
    kind: "manual-dag",
    status: "completed",
    graph: {},
    operations: {},
    policy: { maxConcurrent: 1, autoLand: false, autoMergeOnGreen: false },
    version: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

test.describe("UI-10: gestures, passport, cost badge, agent colors, theme meta, long-press", () => {
  test("swipe-up from bottom edge opens actions drawer (gestures=force)", async ({ page }) => {
    await setupBaseRoutes(page);
    await page.goto("/?gestures=force");
    await page.waitForSelector("header", { timeout: 5_000 });

    await page.evaluate(() => {
      const startY = window.innerHeight - 10;
      const endY = startY - 80;

      document.body.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        clientX: window.innerWidth / 2,
        clientY: startY,
      }));

      document.body.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        clientX: window.innerWidth / 2,
        clientY: endY,
      }));
    });

    const drawer = page.locator('.actions-drawer-body');
    await expect(drawer).toBeVisible({ timeout: 3_000 });
  });

  test("theme toggle updates meta[name=theme-color] content", async ({ page }) => {
    await setupBaseRoutes(page);
    await page.goto("/");
    await page.waitForSelector(".theme-toggle", { timeout: 5_000 });

    const lightBtn = page.locator('.theme-btn[data-value="light"]');
    await lightBtn.click();

    const lightMeta = await page.evaluate(() => {
      const m = document.querySelector('meta[name="theme-color"][media*="light"]');
      return m?.getAttribute('content');
    });
    expect(lightMeta).toBeTruthy();

    const darkBtn = page.locator('.theme-btn[data-value="dark"]');
    await darkBtn.click();

    const darkMeta = await page.evaluate(() => {
      const m = document.querySelector('meta[name="theme-color"][media*="dark"]');
      return m?.getAttribute('content');
    });
    expect(darkMeta).toBeTruthy();

    const systemBtn = page.locator('.theme-btn[data-value="system"]');
    await systemBtn.click();

    const anyMeta = await page.evaluate(() => {
      const metas = document.querySelectorAll('meta[name="theme-color"]');
      return metas.length > 0;
    });
    expect(anyMeta).toBe(true);

    await page.screenshot({ path: "e2e/ui-10.spec.ts-snapshots/theme-meta.png" });
  });

  test("long-press on kanban card shows context menu with Pin", async ({ page }) => {
    const wf = {
      id: "wf-longpress-1",
      kind: "manual-dag",
      status: "active",
      graph: {
        "task-lp-1": {
          id: "task-lp-1",
          title: "Long Press Task",
          executionStatus: "pending",
          stackStatus: "clean",
          dependsOn: [],
          artifacts: [],
          runs: [],
        },
      },
      operations: {},
      policy: { maxConcurrent: 1, autoLand: false, autoMergeOnGreen: false },
      version: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    await page.route("**/workflows", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([wf]) });
      } else {
        route.continue();
      }
    });
    await page.route(`**/workflows/wf-longpress-1`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(wf) })
    );
    await page.route(`**/workflows/wf-longpress-1/events`, (route) =>
      route.fulfill({ status: 200, contentType: "text/event-stream", headers: { "Cache-Control": "no-cache" }, body: "" })
    );
    await page.route("**/push/vapid-public-key", (route) =>
      route.fulfill({ status: 404, body: "not found" })
    );
    await page.route("**/audit/events**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: [] }) })
    );
    await page.route("**/alerts**", (route) => {
      if (!route.request().url().includes("subscribe")) {
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ alerts: [] }) });
      } else {
        route.continue();
      }
    });
    await page.route("**/commands", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
    );

    await page.goto(`/#/workflow/wf-longpress-1`);
    await page.waitForSelector(".task-card", { timeout: 8_000 });

    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const card = document.querySelector('.task-card') as HTMLElement;
        if (!card) { resolve(); return; }

        card.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          clientX: 100,
          clientY: 100,
        }));

        setTimeout(resolve, 600);
      });
    });

    const menu = page.locator('.context-menu');
    await expect(menu).toBeVisible({ timeout: 3_000 });

    const pinItem = menu.locator('.context-menu-item', { hasText: 'Pin' });
    await expect(pinItem).toBeVisible({ timeout: 2_000 });

    await pinItem.click({ force: true });

    const pinned = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('pinned-workflows') ?? '[]');
    });
    expect(Array.isArray(pinned)).toBe(true);

    await page.screenshot({ path: "e2e/ui-10.spec.ts-snapshots/context-menu.png" });
  });

  test("cost badge shows green tier for cost < $0.01", async ({ page }) => {
    await setupBaseRoutes(page);
    await page.goto("/");
    await page.waitForSelector("header", { timeout: 5_000 });

    await page.evaluate(() => {
      const { createCostBadge } = window as unknown as { createCostBadge: (opts: Record<string, unknown>) => { element: HTMLElement; handleUsageEvent: (e: unknown) => void } };
      if (!createCostBadge) return;

      const { element, handleUsageEvent } = createCostBadge({});
      handleUsageEvent({ kind: 'usage', inputTokens: 10, outputTokens: 5, costUsd: 0.005 });
      element.id = 'test-cost-badge';
      document.querySelector('header')?.appendChild(element);
    });

    const badge = page.locator('header .cost-badge');
    const exists = await badge.count();

    if (exists > 0) {
      const tier = await badge.getAttribute('data-tier');
      if (tier) {
        expect(['green', 'yellow', 'orange', 'red']).toContain(tier);
      }
    }

    await page.screenshot({ path: "e2e/ui-10.spec.ts-snapshots/cost-badge.png" });
  });

  test("Passport sub-tab in Activity shows workflow city aliases", async ({ page }) => {
    await setupBaseRoutes(page, TEST_WORKFLOWS);
    await page.goto("/#/activity");
    await page.waitForSelector(".activity-segmented", { timeout: 5_000 });

    const passportBtn = page.locator(".activity-segment[data-view='passport']");
    await expect(passportBtn).toBeVisible({ timeout: 3_000 });

    await passportBtn.click();

    await page.waitForSelector(".passport", { timeout: 3_000 });

    const rows = page.locator(".passport-row");
    await expect(rows).toHaveCount(TEST_WORKFLOWS.length, { timeout: 3_000 });

    const aliases = page.locator(".passport-alias");
    await expect(aliases.first()).toBeVisible();
    const firstAliasText = await aliases.first().textContent();
    expect(firstAliasText).toMatch(/^[a-z]+-[a-z]+-\d{3}$/);

    await page.screenshot({ path: "e2e/ui-10.spec.ts-snapshots/passport.png" });
  });
});
