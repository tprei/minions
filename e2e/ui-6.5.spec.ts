import { test, expect } from "@playwright/test";

const WF_ID = "wf-ui65-test";
const TASK_ID = "task-1";

type Page = Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never;

function makeWorkflow(executionStatus: string, hasPrArtifact: boolean) {
  const artifacts: Array<{ kind: string; ref: string; producedBy: string; createdAt: string }> = [
    { kind: "branch", ref: "feat/ui-6.5", producedBy: TASK_ID, createdAt: "2026-01-01T00:00:00Z" },
  ];
  if (hasPrArtifact) {
    artifacts.push({ kind: "pr", ref: "https://github.com/org/repo/pull/42", producedBy: TASK_ID, createdAt: "2026-01-01T00:00:00Z" });
  }
  return {
    id: WF_ID,
    kind: "single-task",
    status: "active",
    graph: {
      [TASK_ID]: {
        id: TASK_ID,
        title: "My task",
        executionStatus,
        stackStatus: "clean",
        dependsOn: [],
        artifacts,
        runs: [],
      },
    },
    operations: {},
    policy: { maxConcurrent: 1, autoLand: false, autoMergeOnGreen: false },
    version: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

async function setupWorkflowRoutes(page: Page, workflow: ReturnType<typeof makeWorkflow>) {
  await page.route("**/workflows", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([workflow]) });
    }
    return route.continue();
  });
  await page.route(`**/workflows/${WF_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(workflow) }),
  );
  await page.route(`**/workflows/${WF_ID}/events`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body: "",
    }),
  );
  await page.route("**/commands", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
}

async function gotoWorkspace(page: Page, workflow: ReturnType<typeof makeWorkflow>) {
  await setupWorkflowRoutes(page, workflow);
  await page.goto(`/?test=1#/workflow/${WF_ID}`);
  await page.waitForSelector(".workspace-shell", { timeout: 5_000 });
}

test.describe("UI-6.5: Auto-draft PR panel", () => {
  test("draft panel is visible when task is finalizing with no pr artifact", async ({ page }) => {
    const workflow = makeWorkflow("finalizing", false);
    await page.route(`**/workflows/${WF_ID}/tasks/${TASK_ID}/draft-pr`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ title: "T", body: "B" }) }),
    );
    await gotoWorkspace(page, workflow);

    await page.waitForSelector(".draft-pr-panel", { timeout: 5_000 });
    await expect(page.locator(".draft-pr-panel")).toBeVisible();
    await expect(page.locator(".draft-pr-auto-btn")).toBeVisible();
  });

  test("draft panel is NOT visible when task is finalizing but has a pr artifact", async ({ page }) => {
    const workflow = makeWorkflow("finalizing", true);
    await gotoWorkspace(page, workflow);

    await expect(page.locator(".draft-pr-panel")).not.toBeVisible({ timeout: 2_000 });
  });

  test("clicking Auto-draft shows loading then loaded state", async ({ page }) => {
    const workflow = makeWorkflow("finalizing", false);

    let resolveRoute!: () => void;
    const delayedResponse = new Promise<void>((res) => { resolveRoute = res; });

    await page.route(`**/workflows/${WF_ID}/tasks/${TASK_ID}/draft-pr`, async (route) => {
      await delayedResponse;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ title: "Auto PR title", body: "Auto PR body" }),
      });
    });

    await gotoWorkspace(page, workflow);
    await page.waitForSelector(".draft-pr-auto-btn", { timeout: 5_000 });

    const requestPromise = page.waitForRequest(`**/workflows/${WF_ID}/tasks/${TASK_ID}/draft-pr`);
    await page.locator(".draft-pr-auto-btn").click();
    await requestPromise;

    await expect(page.locator(".draft-pr-loading")).toBeVisible({ timeout: 2_000 });
    await expect(page.locator(".draft-pr-cancel-btn")).toBeVisible({ timeout: 1_000 });

    resolveRoute();

    await expect(page.locator(".draft-pr-title-input")).toBeVisible({ timeout: 3_000 });
    await expect(page.locator(".draft-pr-title-input")).toHaveValue("Auto PR title");
    await expect(page.locator(".draft-pr-body-textarea")).toHaveValue("Auto PR body");
    await expect(page.locator(".draft-pr-loading")).not.toBeVisible();
  });

  test("504 timeout: renders timeout error message", async ({ page }) => {
    const workflow = makeWorkflow("finalizing", false);
    await page.route(`**/workflows/${WF_ID}/tasks/${TASK_ID}/draft-pr`, (route) =>
      route.fulfill({
        status: 504,
        contentType: "application/json",
        body: JSON.stringify({ code: "draft_pr_timeout", message: "draft-pr timed out after 30s", details: {} }),
      }),
    );

    await gotoWorkspace(page, workflow);
    await page.waitForSelector(".draft-pr-auto-btn", { timeout: 5_000 });
    await page.locator(".draft-pr-auto-btn").click();

    await expect(page.locator(".draft-pr-error")).toBeVisible({ timeout: 3_000 });
    const msg = await page.locator(".draft-pr-error-msg").textContent();
    expect(msg).toBeTruthy();
    expect(msg!.toLowerCase()).toContain("timed out");
  });

  test("422 no-branch: renders no-branch error message", async ({ page }) => {
    const workflow = makeWorkflow("finalizing", false);
    await page.route(`**/workflows/${WF_ID}/tasks/${TASK_ID}/draft-pr`, (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ code: "invalid_transition", message: "task has no branch artifact", details: {} }),
      }),
    );

    await gotoWorkspace(page, workflow);
    await page.waitForSelector(".draft-pr-auto-btn", { timeout: 5_000 });
    await page.locator(".draft-pr-auto-btn").click();

    await expect(page.locator(".draft-pr-error")).toBeVisible({ timeout: 3_000 });
    const msg = await page.locator(".draft-pr-error-msg").textContent();
    expect(msg).toBeTruthy();
    expect(msg!.toLowerCase()).toContain("no branch");
  });
});
