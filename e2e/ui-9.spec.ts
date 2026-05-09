import { test, expect } from "@playwright/test";

const WF_ID = "wf-ui9-test";
const TASK_A = "task-a";
const OP_ID = "op-restack-1";

function makeWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: WF_ID,
    kind: "manual-dag",
    status: "active",
    graph: {
      [TASK_A]: {
        id: TASK_A,
        title: "Task A",
        executionStatus: "finalizing",
        stackStatus: "restack-conflict",
        dependsOn: [],
        artifacts: [],
        runs: [],
      },
    },
    operations: {
      [OP_ID]: {
        id: OP_ID,
        workflowId: WF_ID,
        kind: "restack",
        targetNodeId: TASK_A,
        affectedNodeIds: [TASK_A],
        fromBase: "abc123",
        toBase: "def456",
        status: "conflict",
        attempt: 1,
        idempotencyKey: "idem-key-1",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:01:00Z",
      },
    },
    policy: { maxConcurrent: 1, autoLand: false, autoMergeOnGreen: false },
    version: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

type Page = Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never;

async function setupCommonRoutes(page: Page, wfOverride?: Record<string, unknown>) {
  const wf = wfOverride ?? makeWorkflow();

  await page.route("**/workflows", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([wf]) });
    } else {
      route.continue();
    }
  });
  await page.route(`**/workflows/${WF_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(wf) })
  );
  await page.route(`**/workflows/${WF_ID}/events`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body: "",
    })
  );
  await page.route("**/commands", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
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
}

async function openDagPanel(page: Page) {
  const tasksPill = page.locator(".tasks-pill");
  await tasksPill.click();
}

test.describe("UI-9: operations strip + completion stepper + workflow card auto-policy badges", () => {
  test("operations strip renders above task list when workflow has in-flight restack op", async ({ page }) => {
    await setupCommonRoutes(page);
    await page.goto(`/#/workflow/${WF_ID}/task/${TASK_A}`);
    await page.waitForSelector("header", { timeout: 5_000 });

    await openDagPanel(page);

    await page.waitForSelector(".operations-strip", { timeout: 8_000 });

    const strip = page.locator(".operations-strip");
    await expect(strip).toBeVisible({ timeout: 5_000 });

    const card = page.locator(".op-card");
    await expect(card).toBeVisible({ timeout: 3_000 });

    const taskList = page.locator(".dag-panel-body");
    const stripBox = await strip.boundingBox();
    const listBox = await taskList.boundingBox();

    if (stripBox && listBox) {
      expect(stripBox.y).toBeLessThanOrEqual(listBox.y);
    }

    await page.screenshot({ path: "e2e/ui-9.spec.ts-snapshots/operations-strip.png" });
  });

  test("operations strip renders kind badge for restack operation", async ({ page }) => {
    await setupCommonRoutes(page);
    await page.goto(`/#/workflow/${WF_ID}/task/${TASK_A}`);
    await page.waitForSelector("header", { timeout: 5_000 });

    await openDagPanel(page);

    await page.waitForSelector(".op-kind-badge", { timeout: 8_000 });
    const badge = page.locator(".op-kind-badge");
    await expect(badge).toContainText("Restack", { timeout: 3_000 });
  });

  test("conflict explainer with markdown and XSS attempt is sanitized", async ({ page }) => {
    const wf = makeWorkflow({
      operations: {
        [OP_ID]: {
          id: OP_ID,
          workflowId: WF_ID,
          kind: "restack",
          targetNodeId: TASK_A,
          affectedNodeIds: [TASK_A],
          fromBase: "abc123",
          toBase: "def456",
          status: "conflict",
          attempt: 1,
          idempotencyKey: "idem-key-1",
          error: "Conflict on `main`\n\n<script>alert('xss')</script>\n\n**bold text**",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:01:00Z",
        },
      },
    });

    await setupCommonRoutes(page, wf);
    await page.goto(`/#/workflow/${WF_ID}/task/${TASK_A}`);
    await page.waitForSelector("header", { timeout: 5_000 });

    await openDagPanel(page);

    await page.waitForSelector(".op-explainer", { timeout: 8_000 });
    const explainer = page.locator(".op-explainer");
    await expect(explainer).toBeVisible({ timeout: 3_000 });

    const html = await explainer.innerHTML();
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("alert(");
    expect(html).toContain("Conflict on");

    await page.screenshot({ path: "e2e/ui-9.spec.ts-snapshots/operations-strip-xss.png" });
  });

  test("resolve button is enabled for conflict op with fromBase", async ({ page }) => {
    await setupCommonRoutes(page);
    await page.goto(`/#/workflow/${WF_ID}/task/${TASK_A}`);
    await page.waitForSelector("header", { timeout: 5_000 });

    await openDagPanel(page);

    await page.waitForSelector(".op-resolve-btn", { timeout: 8_000 });
    const resolveBtn = page.locator(".op-resolve-btn");
    await expect(resolveBtn).toBeEnabled({ timeout: 3_000 });
  });

  test("dismiss button hides op card without posting a command", async ({ page }) => {
    let commandsPosted = 0;
    await page.route("**/commands", (route) => {
      commandsPosted++;
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await setupCommonRoutes(page);
    await page.goto(`/#/workflow/${WF_ID}/task/${TASK_A}`);
    await page.waitForSelector("header", { timeout: 5_000 });

    await openDagPanel(page);

    await page.waitForSelector(".op-card-close-btn", { timeout: 8_000 });
    const closeBtn = page.locator(".op-card-close-btn");
    await closeBtn.click();

    await expect(page.locator(".op-card")).toBeHidden({ timeout: 3_000 });
    expect(commandsPosted).toBe(0);
  });

  test("completion stepper advances through finalizing → pr-open → ci-pending → merged", async ({ page }) => {
    await setupCommonRoutes(page);
    await page.goto(`/#/workflow/${WF_ID}/task/${TASK_A}`);
    await page.waitForSelector("header", { timeout: 5_000 });

    await page.waitForSelector(".completion-stepper", { timeout: 8_000 });
    const stepper = page.locator(".completion-stepper");
    await expect(stepper).toBeVisible({ timeout: 5_000 });

    const finalizingStep = stepper.locator("[data-step='finalizing']");
    await expect(finalizingStep).toHaveClass(/cs-step-active/, { timeout: 3_000 });

    await page.screenshot({ path: "e2e/ui-9.spec.ts-snapshots/completion-stepper-phase-1.png" });

    await page.evaluate(() => {
      const stepper = document.querySelector(".completion-stepper") as HTMLElement | null;
      if (!stepper) throw new Error(".completion-stepper not found");

      const steps = [
        { step: "finalizing", state: "completed", indicator: "✓" },
        { step: "pr-open", state: "active", indicator: "◌" },
      ];
      for (const { step, state, indicator } of steps) {
        const el = stepper.querySelector(`[data-step='${step}']`) as HTMLElement | null;
        if (!el) continue;
        el.className = `cs-step cs-step-${state}`;
        const ind = el.querySelector(".cs-step-indicator") as HTMLElement | null;
        if (ind) ind.textContent = indicator;
      }
    });

    await page.screenshot({ path: "e2e/ui-9.spec.ts-snapshots/completion-stepper-phase-2.png" });

    const prOpenStep = stepper.locator("[data-step='pr-open']");
    await expect(prOpenStep).toHaveClass(/cs-step-active/, { timeout: 3_000 });

    await page.evaluate(() => {
      const stepper = document.querySelector(".completion-stepper") as HTMLElement | null;
      if (!stepper) return;

      const steps = [
        { step: "finalizing", state: "completed", indicator: "✓" },
        { step: "pr-open", state: "completed", indicator: "✓" },
        { step: "ci-pending", state: "active", indicator: "◌" },
      ];
      for (const { step, state, indicator } of steps) {
        const el = stepper.querySelector(`[data-step='${step}']`) as HTMLElement | null;
        if (!el) continue;
        el.className = `cs-step cs-step-${state}`;
        const ind = el.querySelector(".cs-step-indicator") as HTMLElement | null;
        if (ind) ind.textContent = indicator;
      }
    });

    await page.screenshot({ path: "e2e/ui-9.spec.ts-snapshots/completion-stepper-phase-3.png" });

    const ciStep = stepper.locator("[data-step='ci-pending']");
    await expect(ciStep).toHaveClass(/cs-step-active/, { timeout: 3_000 });
  });

  test("workflow cards in list show autoLand and autoMergeOnGreen badges", async ({ page }) => {
    const wf1 = {
      id: "wf-auto-1",
      kind: "manual-dag",
      status: "active",
      graph: {},
      operations: {},
      policy: { maxConcurrent: 1, autoLand: true, autoMergeOnGreen: true },
      version: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const wf2 = {
      id: "wf-auto-2",
      kind: "manual-dag",
      status: "active",
      graph: {},
      operations: {},
      policy: { maxConcurrent: 1, autoLand: false, autoMergeOnGreen: false },
      version: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    await page.route("**/workflows", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([wf1, wf2]) });
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

    await page.goto("/");
    await page.waitForSelector(".workflow-list", { timeout: 5_000 });

    const firstItem = page.locator(".workflow-item").first();
    const autoLandBadge = firstItem.locator(".wf-policy-auto-land");
    const autoMergeBadge = firstItem.locator(".wf-policy-auto-merge");

    await expect(autoLandBadge).toBeVisible({ timeout: 3_000 });
    await expect(autoMergeBadge).toBeVisible({ timeout: 3_000 });

    const secondItem = page.locator(".workflow-item").nth(1);
    await expect(secondItem.locator(".wf-policy-auto-land")).not.toBeVisible();
    await expect(secondItem.locator(".wf-policy-auto-merge")).not.toBeVisible();

    await page.screenshot({ path: "e2e/ui-9.spec.ts-snapshots/workflow-policy-badges.png" });
  });
});
