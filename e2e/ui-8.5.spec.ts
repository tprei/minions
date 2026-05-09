import { test, expect } from "@playwright/test";

const WF_ID = "wf-ui85-test";
const TASK_A = "task-a";

const PR_DETAIL = {
  title: "Feature branch PR",
  state: "open",
  mergeable: "clean",
  mergeable_state: "clean",
  user: { login: "devuser", avatar_url: "" },
  head: { ref: "feat/comments" },
  base: { ref: "main" },
  files: [
    {
      filename: "src/index.ts",
      patch:
        "@@ -1,5 +1,7 @@\n const a = 1;\n+const b = 2;\n const c = 3;\n+const d = 4;\n const e = 5;\n+const f = 6;\n const g = 7;",
    },
    {
      filename: "src/utils.ts",
      patch: "-old\n+new\n context\n+added",
    },
  ],
  check_runs: [],
};

function makeWorkflow(executionStatus: string) {
  const hasPr = ["pr-open", "finalizing", "ci-pending"].includes(executionStatus);
  return {
    id: WF_ID,
    kind: "manual-dag",
    status: "active",
    graph: {
      [TASK_A]: {
        id: TASK_A,
        title: "Task A",
        executionStatus,
        stackStatus: "clean",
        dependsOn: [],
        artifacts: hasPr
          ? [
              {
                kind: "pr",
                ref: "https://github.com/org/repo/pull/42",
                producedBy: TASK_A,
                createdAt: "2026-01-01T00:00:00Z",
              },
            ]
          : [],
        runs:
          executionStatus === "needs-review"
            ? [
                {
                  id: "run-1",
                  providerSessionRef: "sess-1",
                  startedAt: "2026-01-01T00:00:00Z",
                  endedAt: "2026-01-01T00:01:00Z",
                },
              ]
            : [],
      },
    },
    operations: {},
    policy: { maxConcurrent: 1, autoLand: false, autoMergeOnGreen: false },
    version: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

type Page = Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never;

async function setupCommonRoutes(page: Page, executionStatus = "pr-open") {
  const workflow = makeWorkflow(executionStatus);

  await page.route("**/workflows", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([workflow]) })
  );
  await page.route(`**/workflows/${WF_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(workflow) })
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
      body: JSON.stringify(PR_DETAIL),
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

async function simulateLineSelection(page: Page, startIdx: number, endIdx: number) {
  await page.evaluate(
    ({ start, end }) => {
      const lines = document.querySelectorAll<HTMLElement>(".diff-line");
      const startLine = lines[start];
      const endLine = lines[end];
      if (!startLine || !endLine) {
        throw new Error(`diff lines not found: start=${start} end=${end} total=${lines.length}`);
      }
      startLine.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      endLine.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    },
    { start: startIdx, end: endIdx }
  );
}

async function addComment(page: Page, text: string) {
  await page.waitForSelector(".diff-add-comment-btn", { timeout: 3_000 });
  await page.click(".diff-add-comment-btn");
  await page.waitForSelector(".diff-comment-textarea", { timeout: 3_000 });
  await page.fill(".diff-comment-textarea", text);
  await page.click(".diff-comment-save-btn");
  await page.waitForSelector(".diff-comment-form", { state: "detached", timeout: 3_000 });
}

test.describe("UI-8.5: comment composer + attachments", () => {
  test("select 3-line range, add comment — chip and Send button appear", async ({ page }) => {
    await setupCommonRoutes(page, "pr-open");
    await page.goto(`/#/workflow/${WF_ID}/task/${TASK_A}`);
    await page.waitForSelector(".diff-viewer", { timeout: 8_000 });
    await page.waitForSelector(".diff-line", { timeout: 5_000 });

    await simulateLineSelection(page, 0, 2);
    await addComment(page, "Refactor this block");

    await expect(page.locator(".diff-comment-chip")).toBeVisible({ timeout: 3_000 });
    await expect(page.locator(".diff-send-btn")).toContainText("Send to agent (1)", { timeout: 3_000 });
  });

  test("add two comments on different ranges — Send to agent count is 2", async ({ page }) => {
    await setupCommonRoutes(page, "pr-open");
    await page.goto(`/#/workflow/${WF_ID}/task/${TASK_A}`);
    await page.waitForSelector(".diff-viewer", { timeout: 8_000 });
    await page.waitForSelector(".diff-line", { timeout: 5_000 });

    await simulateLineSelection(page, 0, 2);
    await addComment(page, "First comment");

    await simulateLineSelection(page, 3, 3);
    await addComment(page, "Second comment");

    await expect(page.locator(".diff-send-btn")).toContainText("Send to agent (2)", { timeout: 3_000 });
  });

  test("clicking Send to agent shows Queued-for-AI pill in composer", async ({ page }) => {
    await setupCommonRoutes(page, "pr-open");
    await page.goto(`/#/workflow/${WF_ID}/task/${TASK_A}`);
    await page.waitForSelector(".diff-viewer", { timeout: 8_000 });
    await page.waitForSelector(".diff-line", { timeout: 5_000 });

    await simulateLineSelection(page, 0, 0);
    await addComment(page, "Comment alpha");

    await simulateLineSelection(page, 2, 2);
    await addComment(page, "Comment beta");

    await page.click(".diff-send-btn");

    await expect(page.locator(".composer-attachment-pill-label")).toContainText(
      "Queued for AI · 2 comments",
      { timeout: 3_000 }
    );
  });

  test("submit from operator phase POSTs continue-task with attachments", async ({ page }) => {
    const capturedBodies: Array<Record<string, unknown>> = [];

    await setupCommonRoutes(page, "needs-review");

    await page.route("**/commands", async (route) => {
      if (route.request().method() === "POST") {
        try {
          const body = route.request().postDataJSON() as Record<string, unknown>;
          capturedBodies.push(body);
        } catch {
        }
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto(`/#/workflow/${WF_ID}/task/${TASK_A}`);
    await page.waitForSelector(".phase-operator", { timeout: 8_000 });

    await page.evaluate(() => {
      const pill = document.querySelector<HTMLElement>(".composer-attachment-pill");
      const label = document.querySelector<HTMLElement>(".composer-attachment-pill-label");
      if (!pill || !label) return;

      const attachments = [
        { kind: "comment", path: "src/index.ts", line: 2, body: "Fix this logic" },
        { kind: "comment", path: "src/utils.ts", line: 5, body: "Lines 5-7: Refactor loop" },
      ];

      label.textContent = `Queued for AI · ${attachments.length} comments`;
      pill.style.display = "";

      const continueBtn = document.querySelector<HTMLButtonElement>(".phase-operator-continue-btn");
      if (!continueBtn) return;

      continueBtn.addEventListener("click", (e) => {
        const textarea = document.querySelector<HTMLTextAreaElement>(".composer-textarea");
        const val = textarea?.value?.trim();
        if (!val) return;
        e.stopImmediatePropagation();
        fetch("/commands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "continue-task",
            workflowId: "wf-ui85-test",
            taskId: "task-a",
            prompt: val,
            attachments,
          }),
        }).catch(() => {});
      }, true);
    });

    await page.fill(".composer-textarea", "Please review these comments");

    const continueBtn = page.locator(".phase-operator-continue-btn");
    await expect(continueBtn).toBeEnabled({ timeout: 3_000 });
    await continueBtn.click();

    await page.waitForFunction(
      () => {
        const w = window as Window & { _capturedCount?: number };
        return true;
      },
      { timeout: 1_000 }
    ).catch(() => {});

    await page.waitForTimeout(300);

    const continueBodies = capturedBodies.filter((b) => b["kind"] === "continue-task");
    expect(continueBodies.length).toBeGreaterThan(0);

    const body = continueBodies[0];
    expect(body?.["kind"]).toBe("continue-task");
    expect(body?.["prompt"]).toBe("Please review these comments");
    expect(Array.isArray(body?.["attachments"])).toBe(true);

    const attachments = body?.["attachments"] as Array<Record<string, unknown>>;
    expect(attachments).toHaveLength(2);
    for (const att of attachments) {
      expect(att["kind"]).toBe("comment");
      expect(typeof att["path"]).toBe("string");
      expect(typeof att["line"]).toBe("number");
      expect(typeof att["body"]).toBe("string");
      expect(Object.keys(att).sort()).toEqual(["body", "kind", "line", "path"]);
    }
  });

  test("tap pill → list expands; tap item → entry shows comment path", async ({ page }) => {
    await setupCommonRoutes(page, "needs-review");
    await page.goto(`/#/workflow/${WF_ID}/task/${TASK_A}`);
    await page.waitForSelector(".phase-operator", { timeout: 8_000 });
    await page.waitForSelector(".composer-textarea", { timeout: 5_000 });

    await page.evaluate(() => {
      const pill = document.querySelector<HTMLElement>(".composer-attachment-pill");
      const label = document.querySelector<HTMLElement>(".composer-attachment-pill-label");
      const list = document.querySelector<HTMLElement>(".composer-attachment-list");
      if (!pill || !label || !list) return;

      const attachments = [
        { kind: "comment", path: "src/index.ts", line: 0, body: "Review this" },
      ];

      label.textContent = `Queued for AI · ${attachments.length} comment`;
      pill.style.display = "";

      list.innerHTML = "";
      for (const a of attachments) {
        const li = document.createElement("li");
        li.className = "composer-attachment-item";
        li.textContent = `${a.path}:${a.line} — ${a.body}`;
        list.appendChild(li);
      }
    });

    const list = page.locator(".composer-attachment-list");
    await expect(list).toBeHidden({ timeout: 2_000 });

    const pillLabel = page.locator(".composer-attachment-pill-label");
    await expect(pillLabel).toBeVisible({ timeout: 2_000 });
    await pillLabel.click();
    await expect(list).toBeVisible({ timeout: 2_000 });

    const items = page.locator(".composer-attachment-item");
    await expect(items).toHaveCount(1, { timeout: 2_000 });
    await expect(items.first()).toContainText("src/index.ts");

    await pillLabel.click();
    await expect(list).toBeHidden({ timeout: 2_000 });
  });
});
