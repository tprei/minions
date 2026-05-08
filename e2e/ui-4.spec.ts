import { test, expect } from "@playwright/test";

const WF_ID = "wf-ui4-test";
const TASK_ID = "task-ui4-1";

const WORKFLOW = {
  id: WF_ID,
  title: "UI-4 test workflow",
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
}

async function gotoTranscript(page: Page) {
  await setupRoutes(page);
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

test.describe("Tool-call aggregation (UI-4)", () => {
  test("5 consecutive Read calls cluster into +5 Read calls group", async ({ page }) => {
    await gotoTranscript(page);

    for (let i = 0; i < 5; i++) {
      await injectProviderEvent(page, { kind: "tool_call", id: `r${i}`, name: "Read", input: { file: `file${i}.ts` } });
    }
    await injectProviderEvent(page, { kind: "tool_call", id: "bash1", name: "Bash", input: { cmd: "ls" } });
    await injectProviderEvent(page, { kind: "assistant_text", text: "Done reading files" });

    await expect(page.locator(".te-cluster")).toHaveCount(1, { timeout: 5_000 });

    const clusterLabel = page.locator(".te-cluster-label");
    await expect(clusterLabel.first()).toContainText("5");
    await expect(clusterLabel.first()).toContainText("Read");
  });

  test("cluster group exposes all 5 events in its body when expanded", async ({ page }) => {
    await gotoTranscript(page);

    for (let i = 0; i < 5; i++) {
      await injectProviderEvent(page, { kind: "tool_call", id: `r${i}`, name: "Read", input: { file: `file${i}.ts` } });
    }

    await expect(page.locator(".te-cluster")).toHaveCount(1, { timeout: 5_000 });

    const clusterBody = page.locator(".te-cluster-body");
    const headerBtn = page.locator(".te-cluster-header");

    const isExpanded = await clusterBody.isVisible();
    if (!isExpanded) {
      await headerBtn.click();
      await expect(clusterBody).toBeVisible({ timeout: 2_000 });
    }

    const toolCalls = clusterBody.locator(".te-tool-call");
    await expect(toolCalls).toHaveCount(5);
  });

  test("2 consecutive same-kind calls do not cluster", async ({ page }) => {
    await gotoTranscript(page);

    for (let i = 0; i < 2; i++) {
      await injectProviderEvent(page, { kind: "tool_call", id: `r${i}`, name: "Read", input: { file: `file${i}.ts` } });
    }

    await page.waitForSelector(".te-tool-call", { timeout: 5_000 });

    await expect(page.locator(".te-cluster")).toHaveCount(0);
    await expect(page.locator(".te-tool-call")).toHaveCount(2);
  });
});

test.describe("Jump to latest button (UI-4)", () => {
  test("scroll up shows button, click jumps to bottom and hides button", async ({ page }) => {
    await gotoTranscript(page);

    for (let i = 0; i < 40; i++) {
      await injectProviderEvent(page, {
        kind: "assistant_text",
        text: `Line ${i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.`,
      });
    }

    await page.waitForSelector(".te-assistant-text", { timeout: 5_000 });

    const scrollerWrap = page.locator(".phase-transcript-scroller-wrap");

    const scrollHeight = await scrollerWrap.evaluate((el) => el.scrollHeight);
    const clientHeight = await scrollerWrap.evaluate((el) => el.clientHeight);

    if (scrollHeight <= clientHeight) {
      test.skip();
      return;
    }

    await scrollerWrap.evaluate((el) => {
      el.scrollTop = 0;
    });

    await page.waitForTimeout(200);

    const jumpBtn = page.locator(".transcript-jump-btn");
    await expect(jumpBtn).toBeVisible({ timeout: 3_000 });

    await jumpBtn.click();

    await expect(jumpBtn).toBeHidden({ timeout: 2_000 });

    const scrollTop = await scrollerWrap.evaluate((el) => el.scrollTop);
    const scrollHeightAfter = await scrollerWrap.evaluate((el) => el.scrollHeight);
    const clientHeightAfter = await scrollerWrap.evaluate((el) => el.clientHeight);
    expect(scrollTop).toBeGreaterThanOrEqual(scrollHeightAfter - clientHeightAfter - 64);
  });
});

test.describe("Streaming throttle (UI-4)", () => {
  test("100 rapid assistant_text chunks produce correct accumulated final text", async ({ page }) => {
    await gotoTranscript(page);

    for (let i = 0; i < 100; i++) {
      await injectProviderEvent(page, { kind: "assistant_text", text: `word${i} ` });
    }

    await page.waitForSelector(".te-assistant-text", { timeout: 5_000 });
    await page.waitForTimeout(200);

    const textContent = await page.locator(".te-assistant-text").textContent();
    for (let i = 0; i < 100; i++) {
      expect(textContent).toContain(`word${i}`);
    }
  });

  test("100 rapid assistant_text chunks cause ≤10 DOM mutations on the content element", async ({ page }) => {
    await gotoTranscript(page);

    const mutationCount = await page.evaluate(async () => {
      const shell = (window as unknown as { __shell?: { appendTranscriptEvent: (p: unknown) => void } }).__shell;
      if (!shell) throw new Error("__shell not available");

      const scroller = document.querySelector(".phase-transcript-scroller-wrap") as HTMLElement | null;
      if (!scroller) throw new Error(".phase-transcript-scroller-wrap not found");

      let count = 0;
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (
            (m.target as HTMLElement).classList?.contains("te-content") ||
            (m.target as HTMLElement).classList?.contains("te-markdown")
          ) {
            count++;
          }
        }
      });
      observer.observe(scroller, { subtree: true, childList: true, characterData: true });

      for (let i = 0; i < 100; i++) {
        shell.appendTranscriptEvent({ taskId: "task-ui4-1", runId: "run-1", providerEvent: { kind: "assistant_text", text: `chunk${i} ` } });
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 400));
      observer.disconnect();
      return count;
    });

    expect(mutationCount).toBeLessThanOrEqual(10);
  });
});

test.describe("Cost tier badge (UI-4)", () => {
  test("usage event with costUsd < 0.01 shows green tier pill", async ({ page }) => {
    await gotoTranscript(page);
    await injectProviderEvent(page, { kind: "usage", inputTokens: 10, outputTokens: 5, costUsd: 0.005 });

    await expect(page.locator(".te-usage-pill")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".te-usage-tier-green")).toBeVisible();
  });

  test("usage event with costUsd < 0.10 shows yellow tier pill", async ({ page }) => {
    await gotoTranscript(page);
    await injectProviderEvent(page, { kind: "usage", inputTokens: 100, outputTokens: 50, costUsd: 0.05 });

    await expect(page.locator(".te-usage-pill")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".te-usage-tier-yellow")).toBeVisible();
  });

  test("usage event with costUsd < 1.00 shows orange tier pill", async ({ page }) => {
    await gotoTranscript(page);
    await injectProviderEvent(page, { kind: "usage", inputTokens: 1000, outputTokens: 500, costUsd: 0.50 });

    await expect(page.locator(".te-usage-pill")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".te-usage-tier-orange")).toBeVisible();
  });

  test("usage event with costUsd >= 1.00 shows red tier pill", async ({ page }) => {
    await gotoTranscript(page);
    await injectProviderEvent(page, { kind: "usage", inputTokens: 10000, outputTokens: 5000, costUsd: 1.50 });

    await expect(page.locator(".te-usage-pill")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".te-usage-tier-red")).toBeVisible();
  });
});
