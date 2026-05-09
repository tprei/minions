import { test, expect } from "@playwright/test";

const EMPTY_WORKFLOWS_RESPONSE = JSON.stringify([]);

async function setupBaseRoutes(page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never) {
  await page.route("**/workflows", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: EMPTY_WORKFLOWS_RESPONSE,
      });
    } else {
      await route.continue();
    }
  });
  await page.route("**/push/vapid-public-key", async (route) => {
    await route.fulfill({ status: 404, body: "not found" });
  });
  await page.route("**/audit/events**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ events: [] }),
    });
  });
  await page.route("**/alerts**", async (route) => {
    if (!route.request().url().includes("subscribe")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alerts: [] }),
      });
    } else {
      await route.continue();
    }
  });
}

const SEED_AUDIT_EVENTS = [
  {
    id: "ev-1",
    timestamp: new Date().toISOString(),
    actor: "system",
    action: "workflow.created",
    workflowId: "wf-seed-1",
  },
  {
    id: "ev-2",
    timestamp: new Date(Date.now() - 60000).toISOString(),
    actor: "agent",
    action: "task.completed",
    workflowId: "wf-seed-1",
    taskId: "T1",
  },
];

const SEED_ALERTS = [
  {
    id: "al-1",
    timestamp: new Date().toISOString(),
    kind: "orchestrator-silent",
    severity: "warn",
    message: "Orchestrator silent for 10m",
    workflowId: "wf-seed-1",
  },
  {
    id: "al-2",
    timestamp: new Date(Date.now() - 30000).toISOString(),
    kind: "ci-exhausted",
    severity: "error",
    message: "CI retry budget exhausted",
  },
];

test.describe("UI-7: Activity tab + audit feed + alert center + install banner + SSE indicator", () => {
  test("Activity tab is visible in bottom tabs", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupBaseRoutes(page);
    await page.goto("/");
    await page.waitForSelector(".bottom-tabs", { timeout: 5_000 });

    const activityTab = page.locator(".bottom-tab[data-id='activity']");
    await expect(activityTab).toBeVisible();
    const text = await activityTab.textContent();
    expect(text).toContain("Activity");
  });

  test("clicking Activity tab navigates to #/activity", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupBaseRoutes(page);
    await page.goto("/");
    await page.waitForSelector(".bottom-tabs", { timeout: 5_000 });

    await page.locator(".bottom-tab[data-id='activity']").click();
    await page.waitForFunction(
      () => window.location.hash === "#/activity",
      { timeout: 5_000 },
    );
    expect(page.url()).toContain("#/activity");
  });

  test("Activity view shows Audit and Alerts sub-tabs", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupBaseRoutes(page);
    await page.goto("/#/activity");
    await page.waitForSelector(".activity-segmented", { timeout: 5_000 });

    const auditBtn = page.locator(".activity-segment[data-view='audit']");
    const alertsBtn = page.locator(".activity-segment[data-view='alerts']");
    await expect(auditBtn).toBeVisible();
    await expect(alertsBtn).toBeVisible();
  });

  test("Audit feed renders seeded events", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.route("**/workflows", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: EMPTY_WORKFLOWS_RESPONSE,
      });
    });
    await page.route("**/push/vapid-public-key", async (route) => {
      await route.fulfill({ status: 404, body: "not found" });
    });
    await page.route("**/audit/events**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ events: SEED_AUDIT_EVENTS }),
      });
    });
    await page.route("**/alerts**", async (route) => {
      if (!route.request().url().includes("subscribe")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ alerts: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/#/activity");
    await page.waitForSelector(".audit-feed", { timeout: 5_000 });

    await page.waitForSelector(".audit-row", { timeout: 5_000 });
    const rows = page.locator(".audit-row");
    await expect(rows).toHaveCount(2, { timeout: 5_000 });

    const actions = page.locator(".audit-action");
    await expect(actions.first()).toBeVisible();
    const actionTexts = await actions.allTextContents();
    expect(actionTexts).toContain("workflow.created");
    expect(actionTexts).toContain("task.completed");
  });

  test("Alerts feed renders seeded alerts", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.route("**/workflows", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: EMPTY_WORKFLOWS_RESPONSE,
      });
    });
    await page.route("**/push/vapid-public-key", async (route) => {
      await route.fulfill({ status: 404, body: "not found" });
    });
    await page.route("**/audit/events**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ events: [] }),
      });
    });
    await page.route("**/alerts**", async (route) => {
      if (!route.request().url().includes("subscribe")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ alerts: SEED_ALERTS }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/#/activity");
    await page.waitForSelector(".activity-segmented", { timeout: 5_000 });

    await page.locator(".activity-segment[data-view='alerts']").click();
    await page.waitForSelector(".alert-card", { timeout: 5_000 });

    const cards = page.locator(".alert-card");
    await expect(cards).toHaveCount(2, { timeout: 5_000 });

    const warnCard = cards.first();
    await expect(warnCard).toHaveClass(/alert-card-warn/);
    const errCard = cards.nth(1);
    await expect(errCard).toHaveClass(/alert-card-error/);
  });

  test("only All range chip is rendered — Today and Week are absent", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupBaseRoutes(page);
    await page.goto("/#/activity");
    await page.waitForSelector(".audit-chips", { timeout: 5_000 });

    await expect(page.locator(".audit-chip[data-range='all']")).toBeVisible();
    await expect(page.locator(".audit-chip[data-range='today']")).toHaveCount(0);
    await expect(page.locator(".audit-chip[data-range='week']")).toHaveCount(0);
  });

  test("install banner appears on first visit (VAPID configured)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.route("**/workflows", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: EMPTY_WORKFLOWS_RESPONSE,
      });
    });
    await page.route("**/push/vapid-public-key", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ publicKey: "BFakeVapidPublicKeyForTestingPurposesOnly" }),
      });
    });
    await page.route("**/audit/events**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ events: [] }),
      });
    });
    await page.route("**/alerts**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alerts: [] }),
      });
    });

    await page.goto("/");
    await page.waitForSelector(".install-banner", { timeout: 5_000 });
    await expect(page.locator(".install-banner")).toBeVisible();
    await expect(page.locator(".install-banner-subscribe")).toBeVisible();
    await expect(page.locator(".install-banner-dismiss")).toBeVisible();
  });

  test("dismiss install banner: localStorage updated, banner gone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.route("**/workflows", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: EMPTY_WORKFLOWS_RESPONSE,
      });
    });
    await page.route("**/push/vapid-public-key", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ publicKey: "BFakeVapidPublicKeyForTestingPurposesOnly" }),
      });
    });
    await page.route("**/audit/events**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ events: [] }),
      });
    });
    await page.route("**/alerts**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alerts: [] }),
      });
    });

    await page.goto("/");
    await page.waitForSelector(".install-banner", { timeout: 5_000 });

    await page.locator(".install-banner-dismiss").click();

    await expect(page.locator(".install-banner")).not.toBeVisible({ timeout: 3_000 });

    const dismissed = await page.evaluate(
      () => localStorage.getItem("install-banner:dismissed"),
    );
    expect(dismissed).toBe("1");
  });

  test("install banner does not reappear on reload after dismiss", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    const routeAll = async () => {
      await page.route("**/workflows", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: EMPTY_WORKFLOWS_RESPONSE,
        });
      });
      await page.route("**/push/vapid-public-key", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ publicKey: "BFakeVapidPublicKeyForTestingPurposesOnly" }),
        });
      });
      await page.route("**/audit/events**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ events: [] }),
        });
      });
      await page.route("**/alerts**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ alerts: [] }),
        });
      });
    };

    await routeAll();
    await page.goto("/");
    await page.waitForSelector(".install-banner", { timeout: 5_000 });
    await page.locator(".install-banner-dismiss").click();
    await expect(page.locator(".install-banner")).not.toBeVisible({ timeout: 3_000 });

    await routeAll();
    await page.reload();
    await page.waitForSelector(".bottom-tabs", { timeout: 5_000 });
    await expect(page.locator(".install-banner")).not.toBeVisible({ timeout: 2_000 });
  });

  test("connection icon hidden when SSE connected", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    const fakeWorkflow = {
      id: "wf-sse-test",
      kind: "single-task",
      status: "active",
      graph: {
        T1: {
          id: "T1",
          title: "Test",
          executionStatus: "running",
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

    await page.route("**/workflows", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([fakeWorkflow]),
      });
    });
    await page.route("**/push/vapid-public-key", async (route) => {
      await route.fulfill({ status: 404 });
    });
    await page.route("**/workflows/wf-sse-test", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fakeWorkflow),
      });
    });
    await page.route("**/workflows/wf-sse-test/events", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache", "Connection": "keep-alive" },
        body: "",
      });
    });

    await page.goto("/#/workflow/wf-sse-test");

    await page.waitForFunction(
      () => document.querySelector(".live-indicator") !== null,
      { timeout: 8_000 },
    );

    const indicator = page.locator(".live-indicator");
    await page.waitForFunction(
      () => {
        const el = document.querySelector(".live-indicator");
        return el !== null && (el.getAttribute("data-stream-status") === "connected" || el.style.display === "none");
      },
      { timeout: 8_000 },
    );

    const display = await indicator.evaluate((el) => (el as HTMLElement).style.display);
    expect(display).toBe("none");
  });

  test("screenshot: Activity tab — audit view", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.route("**/workflows", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: EMPTY_WORKFLOWS_RESPONSE,
      });
    });
    await page.route("**/push/vapid-public-key", async (route) => {
      await route.fulfill({ status: 404, body: "not found" });
    });
    await page.route("**/audit/events**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ events: SEED_AUDIT_EVENTS }),
      });
    });
    await page.route("**/alerts**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alerts: [] }),
      });
    });

    await page.goto("/#/activity");
    await page.waitForSelector(".audit-feed", { timeout: 5_000 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: "e2e/ui-7.spec.ts-snapshots/activity-audit-mobile.png",
    });
  });
});
