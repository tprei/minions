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
}

test.describe("UI-6: FAB + new-workflow sheet", () => {
  test("FAB is visible on the workflow list page (mobile)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupBaseRoutes(page);
    await page.goto("/");
    await page.waitForSelector(".fab", { timeout: 5_000 });
    const fab = page.locator(".fab");
    await expect(fab).toBeVisible();
  });

  test("FAB is visible on the workflow list page (desktop)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupBaseRoutes(page);
    await page.goto("/");
    await page.waitForSelector(".fab", { timeout: 5_000 });
    const fab = page.locator(".fab");
    await expect(fab).toBeVisible();
  });

  test("FAB is inside header on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupBaseRoutes(page);
    await page.goto("/");
    await page.waitForSelector(".fab", { timeout: 5_000 });
    const fabBox = await page.locator(".fab").boundingBox();
    const headerBox = await page.locator("header").boundingBox();
    expect(fabBox).not.toBeNull();
    expect(headerBox).not.toBeNull();
    expect(fabBox!.y).toBeGreaterThanOrEqual(headerBox!.y);
    expect(fabBox!.y + fabBox!.height).toBeLessThanOrEqual(headerBox!.y + headerBox!.height + 1);
  });

  test("FAB is position:fixed on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupBaseRoutes(page);
    await page.goto("/");
    await page.waitForSelector(".fab", { timeout: 5_000 });
    const position = await page.locator(".fab").evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe("fixed");
  });

  test("clicking FAB opens the new-workflow sheet", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupBaseRoutes(page);
    await page.goto("/");
    await page.waitForSelector(".fab", { timeout: 5_000 });
    await page.locator(".fab").click();
    await expect(page.locator(".sheet-panel")).toBeVisible({ timeout: 3_000 });
    await expect(page.locator(".nwf-prompt")).toBeVisible();
  });

  test("single-task: fill prompt, submit, verify POST body shape and hash navigation", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    let capturedBody: Record<string, unknown> | null = null;

    const fakeWorkflow = {
      id: "wf-1",
      kind: "single-task",
      status: "active",
      graph: {
        "T1": { id: "T1", title: "", executionStatus: "pending", stackStatus: "clean", dependsOn: [], artifacts: [], runs: [] },
      },
      operations: {},
      policy: { maxConcurrent: 1, autoLand: false, autoMergeOnGreen: false },
      version: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    await page.route("**/workflows/wf-1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fakeWorkflow),
      });
    });
    await page.route("**/workflows/wf-1/events", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache" },
        body: "",
      });
    });

    await page.route("**/workflows", async (route) => {
      if (route.request().method() === "POST") {
        capturedBody = await route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: "wf-1" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: EMPTY_WORKFLOWS_RESPONSE,
        });
      }
    });

    await page.goto("/");
    await page.waitForSelector(".fab", { timeout: 5_000 });
    await page.locator(".fab").click();
    await expect(page.locator(".sheet-panel")).toBeVisible({ timeout: 3_000 });
    await page.waitForSelector(".nwf-prompt", { timeout: 3_000 });

    await page.locator(".nwf-prompt").fill("Fix the login bug");
    await page.locator(".nwf-submit-btn").click();

    await page.waitForFunction(() => window.location.hash === "#/workflow/wf-1", { timeout: 5_000 });

    expect(capturedBody).not.toBeNull();
    expect(typeof capturedBody!.id).toBe("string");
    expect(capturedBody!.kind).toBe("single-task");
    const tasks = capturedBody!.tasks as Array<{ id: string; prompt: string; title: string }>;
    expect(Array.isArray(tasks)).toBe(true);
    const t = tasks[0];
    expect(t?.id).toBe("T1");
    expect(t?.prompt).toBe("Fix the login bug");
    expect(typeof t?.title).toBe("string");

    expect(page.url()).toContain("#/workflow/wf-1");
  });

  test("multi-task path: switch kind, add 2 tasks, set T2 depends on T1, verify POST body", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    let capturedBody: Record<string, unknown> | null = null;

    const fakeWorkflow = {
      id: "wf-multi",
      kind: "multi-task",
      status: "active",
      graph: {
        "T1": { id: "T1", title: "", executionStatus: "pending", stackStatus: "clean", dependsOn: [], artifacts: [], runs: [] },
        "T2": { id: "T2", title: "", executionStatus: "pending", stackStatus: "clean", dependsOn: ["T1"], artifacts: [], runs: [] },
      },
      operations: {},
      policy: { maxConcurrent: 1, autoLand: false, autoMergeOnGreen: false },
      version: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    await page.route("**/workflows/wf-multi", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fakeWorkflow),
      });
    });
    await page.route("**/workflows/wf-multi/events", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache" },
        body: "",
      });
    });

    await page.route("**/workflows", async (route) => {
      if (route.request().method() === "POST") {
        capturedBody = await route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: "wf-multi" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: EMPTY_WORKFLOWS_RESPONSE,
        });
      }
    });

    await page.goto("/");
    await page.waitForSelector(".fab", { timeout: 5_000 });
    await page.locator(".fab").click();
    await expect(page.locator(".sheet-panel")).toBeVisible({ timeout: 3_000 });

    const multiBtn = page.locator(".nwf-segment").filter({ hasText: "multi-task" });
    await multiBtn.click();

    await expect(page.locator(".nwf-multi-task-section")).toBeVisible({ timeout: 2_000 });

    const addTaskBtn = page.locator(".nwf-add-task-btn");
    await addTaskBtn.click();

    const prompts = page.locator(".nwf-task-prompt");
    await expect(prompts).toHaveCount(2, { timeout: 2_000 });

    await prompts.nth(0).fill("First task prompt");
    await prompts.nth(1).fill("Second task prompt");

    const depChip = page.locator(".nwf-dep-chip[data-dep='T1']");
    await expect(depChip).toBeVisible({ timeout: 2_000 });
    await depChip.click();
    await expect(depChip).toHaveClass(/selected/);

    await page.locator(".nwf-submit-btn").click();

    await page.waitForFunction(() => window.location.hash === "#/workflow/wf-multi", { timeout: 5_000 });

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.kind).toBe("manual-dag");
    const tasks = capturedBody!.tasks as Array<{ id: string; prompt: string; dependsOn?: string[] }>;
    expect(tasks).toHaveLength(2);
    const mt0 = tasks[0];
    const mt1 = tasks[1];
    expect(mt0?.id).toBe("T1");
    expect(mt0?.prompt).toBe("First task prompt");
    expect(mt1?.id).toBe("T2");
    expect(mt1?.prompt).toBe("Second task prompt");
    expect(mt1?.dependsOn).toContain("T1");
  });

  test("validation: empty prompt — submit button click shows inline error", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupBaseRoutes(page);

    await page.goto("/");
    await page.waitForSelector(".fab", { timeout: 5_000 });
    await page.locator(".fab").click();
    await expect(page.locator(".sheet-panel")).toBeVisible({ timeout: 3_000 });

    await page.locator(".nwf-submit-btn").click();

    const errorEl = page.locator(".nwf-error");
    await expect(errorEl).toBeVisible({ timeout: 2_000 });
    const text = await errorEl.textContent();
    expect(text).toBeTruthy();
    expect(text!.length).toBeGreaterThan(0);
  });

  test("screenshot: new-workflow sheet open on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupBaseRoutes(page);
    await page.goto("/");
    await page.waitForSelector(".fab", { timeout: 5_000 });
    await page.locator(".fab").click();
    await page.waitForSelector(".sheet-panel.open", { timeout: 3_000 });
    await page.screenshot({ path: "e2e/ui-6.spec.ts-snapshots/new-workflow-sheet-mobile.png" });
  });

  test("removing middle task clears stale dependsOn references", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupBaseRoutes(page);
    await page.goto("/");
    await page.waitForSelector(".fab", { timeout: 5_000 });
    await page.locator(".fab").click();
    await expect(page.locator(".sheet-panel")).toBeVisible({ timeout: 3_000 });

    const multiBtn = page.locator(".nwf-segment").filter({ hasText: "multi-task" });
    await multiBtn.click();
    await expect(page.locator(".nwf-multi-task-section")).toBeVisible({ timeout: 2_000 });

    const addTaskBtn = page.locator(".nwf-add-task-btn");
    await addTaskBtn.click();
    await addTaskBtn.click();

    const prompts = page.locator(".nwf-task-prompt");
    await expect(prompts).toHaveCount(3, { timeout: 2_000 });
    await prompts.nth(0).fill("T1 prompt");
    await prompts.nth(1).fill("T2 prompt");
    await prompts.nth(2).fill("T3 prompt");

    const t2chip = page.locator(".nwf-task-row:nth-child(3) .nwf-dep-chip[data-dep='T2']");
    await expect(t2chip).toBeVisible({ timeout: 2_000 });
    await t2chip.click();
    await expect(t2chip).toHaveClass(/selected/);

    const removeButtons = page.locator(".nwf-task-remove-btn");
    await removeButtons.nth(1).click();

    await expect(prompts).toHaveCount(2, { timeout: 2_000 });

    const selectedChips = page.locator(".nwf-dep-chip.selected");
    await expect(selectedChips).toHaveCount(0);
  });
});
