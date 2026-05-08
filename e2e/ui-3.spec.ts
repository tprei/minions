import { test, expect } from "@playwright/test";

const WF_ID = "wf-ui3-test";
const TASK_ID = "task-ui3-1";

const WORKFLOW = {
  id: WF_ID,
  title: "UI-3 test workflow",
  status: "active",
  graph: {
    [TASK_ID]: {
      id: TASK_ID,
      title: "Test task",
      executionStatus: "pending",
      stackStatus: "clean",
      artifacts: [],
      runs: [],
    },
  },
};

function workflowWithStatus(status: string) {
  return {
    ...WORKFLOW,
    graph: {
      [TASK_ID]: { ...WORKFLOW.graph[TASK_ID], executionStatus: status },
    },
  };
}

async function setupRoutes(
  page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never,
  initialStatus = "pending"
) {
  const wf = workflowWithStatus(initialStatus);

  await page.route("**/workflows", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([wf]) })
  );
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
}

async function gotoDetail(
  page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never,
  initialStatus = "pending"
) {
  await setupRoutes(page, initialStatus);
  await page.goto(`/?test=1#/workflow/${WF_ID}`);
  await page.waitForSelector(".workspace-shell", { timeout: 5_000 });
}

async function setStatus(
  page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never,
  status: string
) {
  await page.evaluate(
    (s) => {
      const shell = (window as unknown as { __shell?: { setExecutionStatus: (s: string) => void } }).__shell;
      if (!shell) throw new Error("__shell not available");
      shell.setExecutionStatus(s);
    },
    status
  );
}

const ALL_PHASES = ["input", "transcript", "progress", "diff", "summary", "error", "operator"] as const;

const PHASE_FOR_STATUS: Record<string, string> = {
  pending: "input",
  ready: "input",
  running: "transcript",
  "quality-pending": "progress",
  finalizing: "diff",
  "pr-open": "diff",
  "ci-pending": "progress",
  merged: "summary",
  failed: "error",
  cancelled: "error",
  "needs-review": "operator",
};

test.describe("Phase transitions follow executionStatus", () => {
  test("pending → phase-input visible, others hidden", async ({ page }) => {
    await gotoDetail(page, "pending");

    await expect(page.locator(".phase-input")).toBeVisible();
    for (const p of ALL_PHASES.filter((x) => x !== "input")) {
      await expect(page.locator(`.phase-${p}`)).toBeHidden();
    }
    await expect(page).toHaveScreenshot("phase-pending.png");
  });

  test("running → phase-transcript visible", async ({ page }) => {
    await gotoDetail(page, "running");

    await expect(page.locator(".phase-transcript")).toBeVisible();
    for (const p of ALL_PHASES.filter((x) => x !== "transcript")) {
      await expect(page.locator(`.phase-${p}`)).toBeHidden();
    }
    await expect(page).toHaveScreenshot("phase-running.png");
  });

  test("quality-pending → phase-progress visible", async ({ page }) => {
    await gotoDetail(page, "quality-pending");

    await expect(page.locator(".phase-progress")).toBeVisible();
    await expect(page).toHaveScreenshot("phase-quality-pending.png");
  });

  test("finalizing → phase-diff visible", async ({ page }) => {
    await gotoDetail(page, "finalizing");

    await expect(page.locator(".phase-diff")).toBeVisible();
    await expect(page).toHaveScreenshot("phase-finalizing.png");
  });

  test("merged → phase-summary visible", async ({ page }) => {
    await gotoDetail(page, "merged");

    await expect(page.locator(".phase-summary")).toBeVisible();
    await expect(page).toHaveScreenshot("phase-merged.png");
  });

  test("failed → phase-error visible", async ({ page }) => {
    await gotoDetail(page, "failed");

    await expect(page.locator(".phase-error")).toBeVisible();
    await expect(page).toHaveScreenshot("phase-failed.png");
  });

  test("needs-review → phase-operator visible", async ({ page }) => {
    await gotoDetail(page, "needs-review");

    await expect(page.locator(".phase-operator")).toBeVisible();
    await expect(page).toHaveScreenshot("phase-needs-review.png");
  });

  test("progressive status sequence drives phase changes and all hidden phases remain in DOM", async ({
    page,
  }) => {
    await gotoDetail(page, "pending");

    const sequence = ["pending", "ready", "running", "quality-pending", "finalizing", "merged"] as const;

    for (const status of sequence) {
      await setStatus(page, status);
      const expected = PHASE_FOR_STATUS[status]!;
      await expect(page.locator(`.phase-${expected}`), `phase-${expected} should be visible for ${status}`).toBeVisible();

      for (const p of ALL_PHASES) {
        if (p !== expected) {
          await expect(page.locator(`.phase-${p}`), `phase-${p} should be hidden for status ${status}`).toBeHidden();
        }
      }

      for (const p of ALL_PHASES) {
        const count = await page.locator(`.phase-${p}`).count();
        expect(count, `phase-${p} should still be in DOM for status ${status}`).toBe(1);
      }

      await expect(page).toHaveScreenshot(`phase-seq-${status}.png`);
    }
  });
});

test.describe("Drafts persist across reload", () => {
  test("textarea value survives page reload via localStorage round-trip", async ({ page }) => {
    const wf = workflowWithStatus("running");

    await page.route("**/workflows", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([wf]) })
    );
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

    await page.goto(`/?test=1#/workflow/${WF_ID}`);
    await page.waitForSelector(".workspace-shell", { timeout: 5_000 });
    await expect(page.locator(".phase-transcript")).toBeVisible();

    const textarea = page.locator(".composer-textarea");
    await expect(textarea).toBeVisible();

    const draftText = "draft persisted across reload";
    await textarea.fill(draftText);

    const key = `draft:${WF_ID}:${TASK_ID}`;
    const stored = await page.evaluate((k) => localStorage.getItem(k), key);
    expect(stored).toBe(draftText);

    await page.reload();
    await page.waitForSelector(".workspace-shell", { timeout: 5_000 });
    await expect(page.locator(".phase-transcript")).toBeVisible();

    const restored = await page.locator(".composer-textarea").inputValue();
    expect(restored).toBe(draftText);
  });
});

test.describe("Composer mode shape-shifts", () => {
  test("running phase button reads Queue with clock icon", async ({ page }) => {
    await gotoDetail(page, "running");

    const btn = page.locator(".composer-btn");
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute("data-mode", "running");

    const btnText = await btn.textContent();
    expect(btnText).toContain("Queue");

    await expect(btn.locator(".composer-btn-icon")).toBeVisible();

    const hint = page.locator(".composer-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText("Queued for AI");
  });

  test("pending phase shows Start button in input phase (no composer)", async ({ page }) => {
    await gotoDetail(page, "pending");

    await expect(page.locator(".phase-input")).toBeVisible();
    const startBtn = page.locator(".phase-input-start-btn");
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toHaveText("Start");
  });

  test("switching from pending to running changes to Queue mode", async ({ page }) => {
    await gotoDetail(page, "pending");
    await expect(page.locator(".phase-input")).toBeVisible();

    await setStatus(page, "running");
    await expect(page.locator(".phase-transcript")).toBeVisible();

    const btn = page.locator(".composer-btn");
    await expect(btn).toHaveAttribute("data-mode", "running");
    const btnText = await btn.textContent();
    expect(btnText).toContain("Queue");
  });
});

test.describe("Hidden not unmounted", () => {
  test("composer textarea content preserved across running → quality-pending → running", async ({
    page,
  }) => {
    await gotoDetail(page, "running");
    await expect(page.locator(".phase-transcript")).toBeVisible();

    const textarea = page.locator(".composer-textarea");
    const testContent = "preserved across phase transitions";
    await textarea.fill(testContent);

    await setStatus(page, "quality-pending");
    await expect(page.locator(".phase-progress")).toBeVisible();
    await expect(page.locator(".phase-transcript")).toBeHidden();

    await expect(textarea).toBeHidden();
    const countAfterHide = await page.locator(".composer-textarea").count();
    expect(countAfterHide).toBe(1);

    await setStatus(page, "running");
    await expect(page.locator(".phase-transcript")).toBeVisible();

    const value = await textarea.inputValue();
    expect(value).toBe(testContent);
  });

  test("all phase containers stay in DOM regardless of active phase", async ({ page }) => {
    await gotoDetail(page, "pending");

    for (const status of ["pending", "running", "quality-pending", "merged", "failed"]) {
      await setStatus(page, status);
      for (const p of ALL_PHASES) {
        const count = await page.locator(`.phase-${p}`).count();
        expect(count, `phase-${p} missing from DOM during status ${status}`).toBe(1);
      }
    }
  });
});

test.describe("Error phase recovery buttons", () => {
  test("failed status: Retry and Reset buttons are absent", async ({ page }) => {
    await gotoDetail(page, "failed");
    await expect(page.locator(".phase-error")).toBeVisible();
    await expect(page.locator(".phase-error-retry-btn")).toHaveCount(0);
    await expect(page.locator(".phase-error-reset-btn")).toHaveCount(0);
    await expect(page.locator(".phase-error-recovery-caption")).toBeVisible();
  });

  test("cancelled status: Retry and Reset buttons are absent", async ({ page }) => {
    await gotoDetail(page, "cancelled");
    await expect(page.locator(".phase-error")).toBeVisible();
    await expect(page.locator(".phase-error-retry-btn")).toHaveCount(0);
    await expect(page.locator(".phase-error-reset-btn")).toHaveCount(0);
  });
});

test.describe("Operator phase command wiring", () => {
  test("Continue posts continue-task with textarea prompt", async ({ page }) => {
    const postedBodies: unknown[] = [];
    await setupRoutes(page, "needs-review");
    await page.route("**/commands", async (route) => {
      const body = route.request().postDataJSON();
      postedBodies.push(body);
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto(`/?test=1#/workflow/${WF_ID}`);
    await page.waitForSelector(".workspace-shell", { timeout: 5_000 });
    await page.evaluate(
      (s) => {
        const shell = (window as unknown as { __shell?: { setExecutionStatus: (s: string) => void } }).__shell;
        if (!shell) throw new Error("__shell not available");
        shell.setExecutionStatus(s);
      },
      "needs-review"
    );

    await expect(page.locator(".phase-operator")).toBeVisible();
    await page.locator(".composer-textarea").fill("my feedback prompt");
    await page.locator(".phase-operator-continue-btn").click();

    const continuePost = postedBodies.find(
      (b: unknown) => (b as Record<string, unknown>)["kind"] === "continue-task"
    ) as Record<string, unknown> | undefined;
    expect(continuePost).toBeTruthy();
    expect(continuePost!["taskId"]).toBe(TASK_ID);
    expect(continuePost!["workflowId"]).toBe(WF_ID);
    expect(continuePost!["prompt"]).toBe("my feedback prompt");
  });

  test("Retry posts retry-task with textarea prompt", async ({ page }) => {
    const postedBodies: unknown[] = [];
    await setupRoutes(page, "needs-review");
    await page.route("**/commands", async (route) => {
      const body = route.request().postDataJSON();
      postedBodies.push(body);
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto(`/?test=1#/workflow/${WF_ID}`);
    await page.waitForSelector(".workspace-shell", { timeout: 5_000 });
    await page.evaluate(
      (s) => {
        const shell = (window as unknown as { __shell?: { setExecutionStatus: (s: string) => void } }).__shell;
        if (!shell) throw new Error("__shell not available");
        shell.setExecutionStatus(s);
      },
      "needs-review"
    );

    await expect(page.locator(".phase-operator")).toBeVisible();
    await page.locator(".composer-textarea").fill("retry this with new prompt");
    await page.locator(".phase-operator-retry-btn").click();

    const retryPost = postedBodies.find(
      (b: unknown) => (b as Record<string, unknown>)["kind"] === "retry-task"
    ) as Record<string, unknown> | undefined;
    expect(retryPost).toBeTruthy();
    expect(retryPost!["taskId"]).toBe(TASK_ID);
    expect(retryPost!["workflowId"]).toBe(WF_ID);
    expect(retryPost!["prompt"]).toBe("retry this with new prompt");
  });
});

test.describe("PR link href", () => {
  test("setArtifacts with a pr artifact sets the href on the summary PR link", async ({ page }) => {
    await gotoDetail(page, "merged");
    await expect(page.locator(".phase-summary")).toBeVisible();

    await page.evaluate(() => {
      const shell = (window as unknown as { __shell?: { setArtifacts: (a: unknown[]) => void } }).__shell;
      if (!shell) throw new Error("__shell not available");
      shell.setArtifacts([{ kind: "pr", url: "https://github.com/org/repo/pull/42" }]);
    });

    const link = page.locator(".phase-summary-pr-link");
    await expect(link).toHaveAttribute("href", "https://github.com/org/repo/pull/42");
  });
});
