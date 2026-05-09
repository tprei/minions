import { test, expect } from "@playwright/test";

const WF_ID = "wf-ui45-test";
const TASK_ID = "task-ui45-1";

const WORKFLOW = {
  id: WF_ID,
  title: "UI-4.5 test workflow",
  status: "active",
  graph: {
    [TASK_ID]: {
      id: TASK_ID,
      title: "Test task",
      executionStatus: "running",
      stackStatus: "clean",
      artifacts: [],
      runs: [],
    },
  },
};

type Page = Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never;

async function setupRoutes(page: Page, commandCapture?: { calls: unknown[] }) {
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
  await page.route("**/commands", async (route) => {
    const body = route.request().postDataJSON();
    if (commandCapture) commandCapture.calls.push(body);
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

async function gotoTranscript(page: Page, commandCapture?: { calls: unknown[] }) {
  await setupRoutes(page, commandCapture);
  await page.goto(`/?test=1#/workflow/${WF_ID}`);
  await page.waitForSelector(".phase-transcript", { timeout: 5_000 });
}

async function injectProviderEvent(page: Page, providerEvent: Record<string, unknown>) {
  await page.evaluate(
    ({ taskId, ev }) => {
      const shell = (window as unknown as { __shell?: { appendTranscriptEvent: (p: unknown) => void } }).__shell;
      if (!shell) throw new Error("__shell not available");
      shell.appendTranscriptEvent({ taskId, runId: "run-1", providerEvent: ev });
    },
    { taskId: TASK_ID, ev: providerEvent }
  );
}

const PERMISSION_EVENT = {
  kind: "permission_request",
  id: "req-ui45-1",
  tool: "Bash",
  input: { cmd: "rm -rf /tmp/test" },
};

test.describe("Approval card (UI-4.5)", () => {
  test("permission_request event renders approval card with Approve and Deny buttons", async ({ page }) => {
    await gotoTranscript(page);
    await injectProviderEvent(page, PERMISSION_EVENT);

    await expect(page.locator(".te-approval")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".te-approval-approve-btn")).toBeVisible();
    await expect(page.locator(".te-approval-deny-btn")).toBeVisible();
  });

  test("approval card shows tool name in header", async ({ page }) => {
    await gotoTranscript(page);
    await injectProviderEvent(page, PERMISSION_EVENT);

    await expect(page.locator(".te-approval-header")).toContainText("Bash", { timeout: 5_000 });
  });

  test("deny form is hidden by default", async ({ page }) => {
    await gotoTranscript(page);
    await injectProviderEvent(page, PERMISSION_EVENT);

    await expect(page.locator(".te-approval")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".te-approval-deny-form")).toBeHidden();
  });

  test("Click Approve sends correct POST body", async ({ page }) => {
    const capture: { calls: unknown[] } = { calls: [] };
    await gotoTranscript(page, capture);
    await injectProviderEvent(page, PERMISSION_EVENT);

    await expect(page.locator(".te-approval-approve-btn")).toBeVisible({ timeout: 5_000 });
    await page.locator(".te-approval-approve-btn").click();

    await page.waitForFunction(() => {
      const btn = document.querySelector(".te-approval-approve-btn") as HTMLButtonElement | null;
      return btn?.disabled === true;
    }, { timeout: 3_000 });

    expect(capture.calls).toHaveLength(1);
    const body = capture.calls[0] as Record<string, unknown>;
    expect(body.kind).toBe("approve-permission");
    expect(body.workflowId).toBe(WF_ID);
    expect(body.taskId).toBe(TASK_ID);
    expect(body.requestId).toBe("req-ui45-1");
    expect(body.decision).toBe("approve");
    expect(body.reason).toBeUndefined();
  });

  test("Click Approve shows success state", async ({ page }) => {
    await gotoTranscript(page);
    await injectProviderEvent(page, PERMISSION_EVENT);

    await expect(page.locator(".te-approval-approve-btn")).toBeVisible({ timeout: 5_000 });
    await page.locator(".te-approval-approve-btn").click();

    await expect(page.locator(".te-approval-success")).toBeVisible({ timeout: 3_000 });
    await expect(page.locator(".te-approval-success")).toContainText("Approved");
  });

  test("Click Deny reveals textarea and submit/back buttons", async ({ page }) => {
    await gotoTranscript(page);
    await injectProviderEvent(page, PERMISSION_EVENT);

    await expect(page.locator(".te-approval-deny-btn")).toBeVisible({ timeout: 5_000 });
    await page.locator(".te-approval-deny-btn").click();

    await expect(page.locator(".te-approval-deny-form")).toBeVisible();
    await expect(page.locator(".te-approval-deny-textarea")).toBeVisible();
    await expect(page.locator(".te-approval-submit-deny-btn")).toBeVisible();
    await expect(page.locator(".te-approval-back-btn")).toBeVisible();
    await expect(page.locator(".te-approval-actions")).toBeHidden();
  });

  test("Submit Deny blocked when textarea is empty", async ({ page }) => {
    await gotoTranscript(page);
    await injectProviderEvent(page, PERMISSION_EVENT);

    await expect(page.locator(".te-approval-deny-btn")).toBeVisible({ timeout: 5_000 });
    await page.locator(".te-approval-deny-btn").click();

    const submitBtn = page.locator(".te-approval-submit-deny-btn");
    await expect(submitBtn).toBeDisabled();
  });

  test("Deny with reason POSTs correct body", async ({ page }) => {
    const capture: { calls: unknown[] } = { calls: [] };
    await gotoTranscript(page, capture);
    await injectProviderEvent(page, PERMISSION_EVENT);

    await expect(page.locator(".te-approval-deny-btn")).toBeVisible({ timeout: 5_000 });
    await page.locator(".te-approval-deny-btn").click();

    await page.locator(".te-approval-deny-textarea").fill("too dangerous");
    await page.locator(".te-approval-submit-deny-btn").click();

    await expect(page.locator(".te-approval-success")).toBeVisible({ timeout: 3_000 });

    expect(capture.calls).toHaveLength(1);
    const body = capture.calls[0] as Record<string, unknown>;
    expect(body.kind).toBe("approve-permission");
    expect(body.decision).toBe("deny");
    expect(body.reason).toBe("too dangerous");
  });
});

test.describe("Composer approval-mode hotkeys (UI-4.5)", () => {
  test("permission_request sets composer to approval mode showing hint", async ({ page }) => {
    await gotoTranscript(page);
    await injectProviderEvent(page, PERMISSION_EVENT);

    await expect(page.locator(".te-approval")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".composer-hint-primary")).toContainText("Approval mode", { timeout: 3_000 });
  });

  test("hotkey A in empty textarea approves", async ({ page }) => {
    const capture: { calls: unknown[] } = { calls: [] };
    await gotoTranscript(page, capture);
    await injectProviderEvent(page, PERMISSION_EVENT);

    await expect(page.locator(".te-approval")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".composer-hint-primary")).toContainText("Approval mode", { timeout: 3_000 });

    const ta = page.locator(".composer-textarea");
    await ta.click();
    await ta.press("a");

    await expect(page.locator(".te-approval-success")).toBeVisible({ timeout: 3_000 });

    expect(capture.calls).toHaveLength(1);
    const body = capture.calls[0] as Record<string, unknown>;
    expect(body.decision).toBe("approve");
  });

  test("hotkey D in empty textarea opens deny flow", async ({ page }) => {
    await gotoTranscript(page);
    await injectProviderEvent(page, PERMISSION_EVENT);

    await expect(page.locator(".te-approval")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".composer-hint-primary")).toContainText("Approval mode", { timeout: 3_000 });

    const ta = page.locator(".composer-textarea");
    await ta.click();
    await ta.press("d");

    await expect(page.locator(".te-approval-deny-form")).toBeVisible({ timeout: 3_000 });
  });
});
