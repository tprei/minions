import { test, expect } from "@playwright/test";

const WF_ID = "wf-ui5-test";
const TASK_A = "task-a";
const TASK_B = "task-b";
const TASK_C = "task-c";

const CI_REF = JSON.stringify({
  prNumber: 7,
  prUrl: "https://github.com/org/repo/pull/7",
  headSha: "deadbeef12345678",
  failed: [{ name: "unit-tests", conclusion: "failure" }],
  at: "2026-01-01T00:00:00Z",
});

const QUALITY_REF = JSON.stringify({
  overallStatus: "fail",
  checks: [{ name: "lint", status: "pass" }, { name: "tests", status: "fail" }],
  ranAt: "2026-01-01T00:00:00Z",
});

const WORKFLOW = {
  id: WF_ID,
  kind: "manual-dag",
  status: "active",
  graph: {
    [TASK_A]: {
      id: TASK_A,
      title: "Task A",
      executionStatus: "completed",
      stackStatus: "clean",
      dependsOn: [],
      artifacts: [
        { kind: "branch", ref: "feat/ui-5", producedBy: TASK_A, createdAt: "2026-01-01T00:00:00Z" },
        { kind: "commit", ref: "abcdef1234567890", producedBy: TASK_A, createdAt: "2026-01-01T00:00:00Z" },
      ],
      runs: [
        { id: "run-a-1", taskId: TASK_A, attempt: 0, providerType: "claude", runtimeType: "tmux", runtimeSessionId: "s1", startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:01:00Z", terminalReason: "completed" },
        { id: "run-a-2", taskId: TASK_A, attempt: 1, providerType: "claude", runtimeType: "tmux", runtimeSessionId: "s2", startedAt: "2026-01-01T00:02:00Z", endedAt: "2026-01-01T00:03:00Z", terminalReason: "completed" },
      ],
    },
    [TASK_B]: {
      id: TASK_B,
      title: "Task B",
      executionStatus: "ci-pending",
      stackStatus: "restack-pending",
      dependsOn: [TASK_A],
      artifacts: [
        { kind: "ci-report", ref: CI_REF, producedBy: TASK_B, createdAt: "2026-01-01T00:00:00Z" },
      ],
      runs: [
        { id: "run-b-1", taskId: TASK_B, attempt: 0, providerType: "claude", runtimeType: "tmux", runtimeSessionId: "s3", startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:01:00Z", terminalReason: "completed" },
      ],
    },
    [TASK_C]: {
      id: TASK_C,
      title: "Task C",
      executionStatus: "quality-pending",
      stackStatus: "clean",
      dependsOn: [TASK_B],
      artifacts: [
        { kind: "quality-report", ref: QUALITY_REF, producedBy: TASK_C, createdAt: "2026-01-01T00:00:00Z" },
      ],
      runs: [],
    },
  },
  operations: {},
  policy: { maxConcurrent: 2, autoLand: false, autoMergeOnGreen: false },
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

type Page = Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never;

async function setupRoutes(page: Page) {
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
      body: JSON.stringify({
        title: "Test PR from mock",
        state: "open",
        user: { login: "testuser", avatar_url: "" },
        body: "PR body text",
      }),
    })
  );
}

async function gotoWorkflow(page: Page) {
  await setupRoutes(page);
  await page.goto(`/?test=1#/workflow/${WF_ID}`);
  await page.waitForSelector("header", { timeout: 5_000 });
}

test.describe("Tasks pill (UI-5)", () => {
  test("Tasks pill is visible in header with correct count", async ({ page }) => {
    await gotoWorkflow(page);
    const pill = page.locator(".tasks-pill");
    await expect(pill).toBeVisible({ timeout: 5_000 });
    await expect(pill).toContainText("Tasks · 3");
  });

  test("Tasks pill has dirty indicator when a task has non-clean stackStatus", async ({ page }) => {
    await gotoWorkflow(page);
    const pill = page.locator(".tasks-pill");
    await expect(pill).toBeVisible({ timeout: 5_000 });
    await expect(pill).toHaveClass(/tasks-pill-dirty/);
  });

  test("city alias is displayed in header", async ({ page }) => {
    await gotoWorkflow(page);
    const alias = page.locator(".workflow-alias");
    await expect(alias).toBeVisible({ timeout: 5_000 });
    await expect(alias).toHaveText(/^[a-z]+-[a-z]+-\d{3}$/);
  });
});

test.describe("DAG panel (UI-5)", () => {
  test("clicking Tasks pill opens DAG panel on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoWorkflow(page);

    const pill = page.locator(".tasks-pill");
    await expect(pill).toBeVisible({ timeout: 5_000 });
    await pill.click();

    const sheet = page.locator(".sheet-panel");
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    await expect(sheet).toContainText("Task A");
    await expect(sheet).toContainText("Task B");
    await expect(sheet).toContainText("Task C");

    await page.screenshot({ path: "e2e/ui-5.spec.ts-snapshots/dag-bottom-sheet.png", fullPage: false });
  });

  test("task row shows stack-status pill for restack-pending", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoWorkflow(page);

    const pill = page.locator(".tasks-pill");
    await pill.click();

    const stackPill = page.locator(".dag-stack-pill").first();
    await expect(stackPill).toBeVisible({ timeout: 5_000 });
    await expect(stackPill).toContainText("restack-pending");
  });

  test("dependency chip shows for task-b depends on task-a", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoWorkflow(page);

    await page.locator(".tasks-pill").click();
    const sheet = page.locator(".sheet-panel");
    await expect(sheet).toBeVisible({ timeout: 5_000 });

    const depChip = page.locator(".dag-dep-chip").first();
    await expect(depChip).toBeVisible();
    await expect(depChip).toContainText(TASK_A);
  });

  test("clicking Tasks pill on desktop mounts inline panel inside .workspace-right-rail", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoWorkflow(page);

    const pill = page.locator(".tasks-pill");
    await expect(pill).toBeVisible({ timeout: 5_000 });
    await pill.click();

    const rail = page.locator(".workspace-right-rail");
    await expect(rail).toBeAttached({ timeout: 3_000 });

    const inlinePanel = rail.locator(".dag-inline-panel");
    await expect(inlinePanel).toBeVisible({ timeout: 3_000 });
    await expect(inlinePanel).toContainText("Task A");
  });
});

test.describe("Artifact renderers (UI-5)", () => {
  test("branch artifact chip renders with ref", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoWorkflow(page);
    await page.locator(".tasks-pill").click();
    await expect(page.locator(".sheet-panel")).toBeVisible({ timeout: 5_000 });

    const branches = page.locator(".artifact-branch");
    await expect(branches.first()).toBeAttached({ timeout: 3_000 });
    const text = await branches.first().textContent();
    expect(text).toContain("feat/ui-5");

    await page.screenshot({ path: "e2e/ui-5.spec.ts-snapshots/artifact-branch.png", fullPage: false });
  });

  test("commit artifact chip shows 8-char SHA", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoWorkflow(page);
    await page.locator(".tasks-pill").click();
    await expect(page.locator(".sheet-panel")).toBeVisible({ timeout: 5_000 });

    const commits = page.locator(".artifact-commit");
    await expect(commits.first()).toBeAttached({ timeout: 3_000 });
    const text = await commits.first().textContent();
    expect(text).toBe("abcdef12");
  });

  test("ci-report artifact renders PR link and failed checks", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoWorkflow(page);
    await page.locator(".tasks-pill").click();

    const sheet = page.locator(".sheet-panel");
    await expect(sheet).toBeVisible({ timeout: 5_000 });

    await expect(page.locator(".ci-pr-link")).toBeAttached({ timeout: 3_000 });
    const linkText = await page.locator(".ci-pr-link").first().textContent();
    expect(linkText).toContain("7");

    await expect(page.locator(".ci-failed-item")).toBeAttached();
    const failedText = await page.locator(".ci-failed-item").first().textContent();
    expect(failedText).toContain("unit-tests");
  });

  test("quality-report artifact renders overallStatus pill and check rows", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoWorkflow(page);
    await page.locator(".tasks-pill").click();

    const sheet = page.locator(".sheet-panel");
    await expect(sheet).toBeVisible({ timeout: 5_000 });

    await expect(page.locator(".quality-status-pill")).toBeAttached({ timeout: 3_000 });
    const pillText = await page.locator(".quality-status-pill").first().textContent();
    expect(pillText).toBe("fail");
  });

  test("pr artifact renders with proxy (mock)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoWorkflow(page);
    await page.evaluate(() => {
      const ui = (window as unknown as { __ui?: Record<string, unknown> }).__ui;
      if (!ui) throw new Error("__ui not available");
      const render = (ui["createDagPanel"] as (opts: Record<string, unknown>) => { open: () => void });
      const workflow = {
        id: "test",
        graph: {
          ta: {
            id: "ta",
            title: "Task",
            executionStatus: "pr-open",
            stackStatus: "clean",
            dependsOn: [],
            artifacts: [{ kind: "pr", ref: "https://api.github.com/repos/org/repo/pulls/42", producedBy: "ta", createdAt: "" }],
            runs: [],
          },
        },
        operations: {},
        policy: { maxConcurrent: 1, autoLand: false, autoMergeOnGreen: false },
      };
      const panel = render({ workflow, onTaskFocus: () => {} });
      panel.open(document.body);
    });

    await expect(page.locator(".artifact-pr")).toBeAttached({ timeout: 3_000 });
    await page.waitForSelector(".artifact-pr-title", { timeout: 5_000 });
    const titleText = await page.locator(".artifact-pr-title").first().textContent();
    expect(titleText).toContain("Test PR from mock");
  });
});

test.describe("Runs panel (UI-5)", () => {
  test("run history is collapsed by default when task has >1 run", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoWorkflow(page);
    await page.locator(".tasks-pill").click();

    const sheet = page.locator(".sheet-panel");
    await expect(sheet).toBeVisible({ timeout: 5_000 });

    await expect(page.locator(".runs-list").first()).toBeAttached({ timeout: 3_000 });
    const display = await page.locator(".runs-list").first().evaluate((el: HTMLElement) => el.style.display);
    expect(display).toBe("none");
  });

  test("clicking runs toggle expands the run list", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoWorkflow(page);
    await page.locator(".tasks-pill").click();

    const sheet = page.locator(".sheet-panel");
    await expect(sheet).toBeVisible({ timeout: 5_000 });

    await expect(page.locator(".runs-toggle").first()).toBeAttached({ timeout: 3_000 });

    await page.evaluate(() => {
      const toggle = document.querySelector(".runs-toggle") as HTMLButtonElement | null;
      if (!toggle) throw new Error(".runs-toggle not found");
      toggle.click();
    });

    const display = await page.locator(".runs-list").first().evaluate((el: HTMLElement) => el.style.display);
    expect(display).not.toBe("none");
  });

  test("restore button is disabled with TBD helper", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoWorkflow(page);
    await page.locator(".tasks-pill").click();

    const sheet = page.locator(".sheet-panel");
    await expect(sheet).toBeVisible({ timeout: 5_000 });

    const toggle = page.locator(".runs-toggle").first();
    await expect(toggle).toBeAttached({ timeout: 3_000 });
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click({ force: true });

    const restoreBtn = page.locator(".run-restore-btn").first();
    await expect(restoreBtn).toBeAttached({ timeout: 2_000 });
    const disabled = await restoreBtn.evaluate((el: HTMLButtonElement) => el.disabled);
    expect(disabled).toBe(true);

    const helper = page.locator(".run-restore-helper").first();
    const helperText = await helper.textContent();
    expect(helperText).toContain("TBD");
  });
});
