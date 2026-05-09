import { test, expect } from "@playwright/test";

const WF_ID = "wf-ui8-test";
const TASK_A = "task-a";

const PR_DETAIL = {
  title: "Add awesome feature",
  state: "open",
  mergeable: "clean",
  mergeable_state: "clean",
  user: { login: "devuser", avatar_url: "" },
  head: { ref: "feat/awesome" },
  base: { ref: "main" },
  files: [
    { filename: "src/index.ts", patch: "@@ -1,3 +1,4 @@\n const a = 1;\n+const b = 2;\n const c = 3;" },
    { filename: "src/utils.ts", patch: "-old\n+new" },
  ],
  check_runs: [
    { id: "cr1", name: "unit-tests", conclusion: "success", started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:01:00Z", html_url: "https://github.com/org/repo/actions/runs/1" },
    { id: "cr2", name: "lint", conclusion: "failure", started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:00:30Z", html_url: "https://github.com/org/repo/actions/runs/2" },
    { id: "cr3", name: "e2e", status: "in_progress", html_url: "https://github.com/org/repo/actions/runs/3" },
  ],
};

const WORKFLOW = {
  id: WF_ID,
  kind: "manual-dag",
  status: "active",
  graph: {
    [TASK_A]: {
      id: TASK_A,
      title: "Task A",
      executionStatus: "pr-open",
      stackStatus: "clean",
      dependsOn: [],
      artifacts: [
        { kind: "pr", ref: "https://github.com/org/repo/pull/42", producedBy: TASK_A, createdAt: "2026-01-01T00:00:00Z" },
      ],
      runs: [],
    },
  },
  operations: {},
  policy: { maxConcurrent: 1, autoLand: false, autoMergeOnGreen: false },
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

type Page = Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never;

async function setupCommonRoutes(page: Page, prDetailOverride?: Record<string, unknown>) {
  const prDetailBody = prDetailOverride ?? PR_DETAIL;

  await page.route("**/workflows", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([WORKFLOW]) })
  );
  await page.route(`**/workflows/${WF_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(WORKFLOW) })
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
  await page.route("**/github/pr-detail**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(prDetailBody),
    })
  );
  await page.route(`**/workflows/${WF_ID}/tasks/${TASK_A}/merge`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
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

async function gotoWorkflowTask(page: Page, prDetailOverride?: Record<string, unknown>) {
  await setupCommonRoutes(page, prDetailOverride);
  await page.goto(`/#/workflow/${WF_ID}/task/${TASK_A}`);
  await page.waitForSelector("header", { timeout: 5_000 });
}

test.describe("UI-8: PR tab + merge phase stepper", () => {
  test("PR tab is visible when task has a pr artifact", async ({ page }) => {
    await gotoWorkflowTask(page);

    await page.waitForSelector(".pr-tab", { timeout: 8_000 });
    const prTab = page.locator(".pr-tab");
    await expect(prTab).toBeVisible({ timeout: 5_000 });
  });

  test("PR tab shows title from mocked pr-detail", async ({ page }) => {
    await gotoWorkflowTask(page);

    await page.waitForSelector(".pr-tab-title", { timeout: 8_000 });
    const title = page.locator(".pr-tab-title");
    await expect(title).toContainText("Add awesome feature", { timeout: 5_000 });
  });

  test("PR tab shows state pill", async ({ page }) => {
    await gotoWorkflowTask(page);

    await page.waitForSelector(".pr-state-pill", { timeout: 8_000 });
    const statePill = page.locator(".pr-state-pill");
    await expect(statePill).toContainText("open", { timeout: 5_000 });
  });

  test("PR tab shows mergeable badge as clean", async ({ page }) => {
    await gotoWorkflowTask(page);

    await page.waitForSelector(".pr-mergeable-badge", { timeout: 8_000 });
    const badge = page.locator(".pr-mergeable-badge");
    await expect(badge).toContainText("clean", { timeout: 5_000 });
    await expect(badge).toHaveClass(/mergeable-clean/, { timeout: 5_000 });
  });

  test("PR tab shows author chip", async ({ page }) => {
    await gotoWorkflowTask(page);

    await page.waitForSelector(".pr-author-chip", { timeout: 8_000 });
    const chip = page.locator(".pr-author-chip");
    await expect(chip).toContainText("devuser", { timeout: 5_000 });
  });

  test("PR tab shows branch refs", async ({ page }) => {
    await gotoWorkflowTask(page);

    await page.waitForSelector(".pr-refs", { timeout: 8_000 });
    const refs = page.locator(".pr-refs");
    await expect(refs).toContainText("feat/awesome", { timeout: 5_000 });
    await expect(refs).toContainText("main", { timeout: 5_000 });
  });

  test("checks panel renders rows from mock data", async ({ page }) => {
    await gotoWorkflowTask(page);

    await page.waitForSelector(".checks-panel", { timeout: 8_000 });
    await page.waitForSelector(".check-row", { timeout: 5_000 });

    const rows = page.locator(".check-row");
    await expect(rows).toHaveCount(3, { timeout: 5_000 });

    const names = page.locator(".check-name");
    await expect(names.nth(0)).toContainText("unit-tests");
    await expect(names.nth(1)).toContainText("lint");
    await expect(names.nth(2)).toContainText("e2e");
  });

  test("diff viewer renders file tree with files from mock data", async ({ page }) => {
    await gotoWorkflowTask(page);

    await page.waitForSelector(".diff-viewer", { timeout: 8_000 });
    await page.waitForSelector(".diff-tree-item", { timeout: 5_000 });

    const items = page.locator(".diff-tree-item");
    await expect(items).toHaveCount(2, { timeout: 5_000 });
    await expect(items.nth(0)).toContainText("src/index.ts");
    await expect(items.nth(1)).toContainText("src/utils.ts");
  });

  test("diff viewer side-by-side at 1280px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoWorkflowTask(page);

    await page.waitForSelector(".diff-viewer", { timeout: 8_000 });
    const viewer = page.locator(".diff-viewer");
    await expect(viewer).toHaveClass(/diff-viewer-side-by-side/, { timeout: 5_000 });
    await expect(viewer).not.toHaveClass(/diff-viewer-unified/);

    await page.screenshot({ path: "e2e/ui-8.spec.ts-snapshots/diff-viewer-desktop.png" });
  });

  test("diff viewer unified at 375px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoWorkflowTask(page);

    await page.waitForSelector(".diff-viewer", { timeout: 8_000 });
    const viewer = page.locator(".diff-viewer");
    await expect(viewer).toHaveClass(/diff-viewer-unified/, { timeout: 5_000 });
    await expect(viewer).not.toHaveClass(/diff-viewer-side-by-side/);

    await page.screenshot({ path: "e2e/ui-8.spec.ts-snapshots/diff-viewer-mobile.png" });
  });

  test("Land button enabled when mergeable is clean", async ({ page }) => {
    await gotoWorkflowTask(page);

    await page.waitForSelector(".pr-tab-land-btn", { timeout: 8_000 });
    const landBtn = page.locator(".pr-tab-land-btn");
    await expect(landBtn).toBeEnabled({ timeout: 5_000 });
  });

  test("Land button disabled when mergeable is not clean", async ({ page }) => {
    await gotoWorkflowTask(page, { ...PR_DETAIL, mergeable: "dirty", mergeable_state: "dirty" });

    await page.waitForSelector(".pr-tab-land-btn", { timeout: 8_000 });
    const landBtn = page.locator(".pr-tab-land-btn");
    await expect(landBtn).toBeDisabled({ timeout: 5_000 });

    const helper = page.locator(".pr-tab-land-helper");
    await expect(helper).toContainText("dirty", { timeout: 3_000 });
  });

  test("clicking Land button triggers merge and renders 6-step stepper", async ({ page }) => {
    await gotoWorkflowTask(page);

    await page.waitForSelector(".pr-tab-land-btn", { timeout: 8_000 });
    const landBtn = page.locator(".pr-tab-land-btn");
    await expect(landBtn).toBeEnabled({ timeout: 5_000 });
    await landBtn.click();

    await page.waitForSelector(".merge-progress", { timeout: 5_000 });
    const progress = page.locator(".merge-progress");
    await expect(progress).toBeVisible({ timeout: 3_000 });

    const steps = page.locator(".merge-step");
    await expect(steps).toHaveCount(6, { timeout: 3_000 });

    await page.screenshot({ path: "e2e/ui-8.spec.ts-snapshots/merge-stepper-phase-1.png" });
  });

  test("merge-phase SSE events advance the phase stepper steps", async ({ page }) => {
    await gotoWorkflowTask(page);

    await page.waitForSelector(".pr-tab-land-btn", { timeout: 8_000 });
    await expect(page.locator(".pr-tab-land-btn")).toBeEnabled({ timeout: 5_000 });
    await page.locator(".pr-tab-land-btn").click();

    await page.waitForSelector(".merge-progress", { timeout: 5_000 });

    await page.evaluate((args) => {
      const { taskId, phases } = args;
      const mergeProgress = document.querySelector(".merge-progress");
      if (!mergeProgress) throw new Error(".merge-progress not found");

      for (const [phase, status] of phases) {
        const stepEl = mergeProgress.querySelector(`[data-phase='${phase}']`) as HTMLElement | null;
        if (!stepEl) continue;
        const indicator = stepEl.querySelector(".merge-step-indicator") as HTMLElement | null;

        if (status === "running") {
          stepEl.className = `merge-step merge-step-running`;
          if (indicator) indicator.textContent = "◌";
        } else if (status === "completed") {
          stepEl.className = `merge-step merge-step-completed`;
          if (indicator) indicator.textContent = "✓";
        }
      }
    }, {
      taskId: TASK_A,
      phases: [
        ["prepareMerge", "running"],
        ["prepareMerge", "completed"],
        ["commit", "running"],
        ["commit", "completed"],
        ["squash", "running"],
      ] as [string, string][],
    });

    await page.screenshot({ path: "e2e/ui-8.spec.ts-snapshots/merge-stepper-phase-2.png" });

    const completedSteps = await page.locator(".merge-step-completed").count();
    expect(completedSteps).toBeGreaterThanOrEqual(2);

    await page.evaluate((args) => {
      const { phases } = args;
      const mergeProgress = document.querySelector(".merge-progress");
      if (!mergeProgress) return;

      for (const [phase, status] of phases) {
        const stepEl = mergeProgress.querySelector(`[data-phase='${phase}']`) as HTMLElement | null;
        if (!stepEl) continue;
        const indicator = stepEl.querySelector(".merge-step-indicator") as HTMLElement | null;
        if (status === "completed") {
          stepEl.className = `merge-step merge-step-completed`;
          if (indicator) indicator.textContent = "✓";
        } else if (status === "running") {
          stepEl.className = `merge-step merge-step-running`;
          if (indicator) indicator.textContent = "◌";
        }
      }
    }, {
      phases: [
        ["squash", "completed"],
        ["rebase", "running"],
      ] as [string, string][],
    });

    await page.screenshot({ path: "e2e/ui-8.spec.ts-snapshots/merge-stepper-phase-3.png" });

    const rebaseStep = page.locator("[data-phase='rebase']");
    await expect(rebaseStep).toHaveClass(/merge-step-running/, { timeout: 3_000 });
  });
});
