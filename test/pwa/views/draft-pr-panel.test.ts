import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createDraftPrPanel } from "../../../pwa/assets/views/draft-pr-panel.js";

async function flush(n = 15) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mountPanel(onDraft?: ((draft: { title: string; body: string }) => void) | null) {
  const panel = createDraftPrPanel({ workflowId: "wf-1", taskId: "T1", onDraft: onDraft ?? null });
  document.body.appendChild(panel.element);
  return panel;
}

describe("createDraftPrPanel", () => {
  it("starts in idle state: shows auto-draft button, hides loading/loaded/error", () => {
    const panel = mountPanel();
    const idleEl = panel.element.querySelector(".draft-pr-idle") as HTMLElement;
    const loadingEl = panel.element.querySelector(".draft-pr-loading") as HTMLElement;
    const loadedEl = panel.element.querySelector(".draft-pr-loaded") as HTMLElement;
    const errorEl = panel.element.querySelector(".draft-pr-error") as HTMLElement;
    expect(idleEl.style.display).not.toBe("none");
    expect(loadingEl.style.display).toBe("none");
    expect(loadedEl.style.display).toBe("none");
    expect(errorEl.style.display).toBe("none");
    const btn = panel.element.querySelector(".draft-pr-auto-btn") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toContain("Auto-draft");
  });

  it("Idle → Loading → Loaded transition: fetch called with POST, skeleton then fields", async () => {
    let resolveResponse!: (r: Response) => void;
    const fetchPromise = new Promise<Response>((res) => { resolveResponse = res; });
    const fetchSpy = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal("fetch", fetchSpy);

    const panel = mountPanel();
    const autoBtn = panel.element.querySelector(".draft-pr-auto-btn") as HTMLButtonElement;
    autoBtn.click();

    const loadingEl = panel.element.querySelector(".draft-pr-loading") as HTMLElement;
    const idleEl = panel.element.querySelector(".draft-pr-idle") as HTMLElement;
    expect(loadingEl.style.display).not.toBe("none");
    expect(idleEl.style.display).toBe("none");
    expect(panel.element.querySelector(".draft-pr-skeleton-title")).not.toBeNull();
    expect(panel.element.querySelector(".draft-pr-spinner")).not.toBeNull();
    expect(panel.element.querySelector(".draft-pr-cancel-btn")).not.toBeNull();

    resolveResponse(new Response(JSON.stringify({ title: "My PR", body: "Some changes" }), { status: 200 }));
    await flush();

    const loadedEl = panel.element.querySelector(".draft-pr-loaded") as HTMLElement;
    expect(loadedEl.style.display).not.toBe("none");
    expect(loadingEl.style.display).toBe("none");
    const titleInput = panel.element.querySelector(".draft-pr-title-input") as HTMLInputElement;
    const bodyTextarea = panel.element.querySelector(".draft-pr-body-textarea") as HTMLTextAreaElement;
    expect(titleInput.value).toBe("My PR");
    expect(bodyTextarea.value).toBe("Some changes");

    expect(fetchSpy).toHaveBeenCalledWith(
      "/workflows/wf-1/tasks/T1/draft-pr",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("Cancel mid-flight aborts fetch and returns to idle", async () => {
    let rejectResponse!: (e: Error) => void;
    const fetchPromise = new Promise<Response>((_, rej) => { rejectResponse = rej; });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fetchPromise));

    const panel = mountPanel();
    const autoBtn = panel.element.querySelector(".draft-pr-auto-btn") as HTMLButtonElement;
    autoBtn.click();

    const loadingEl = panel.element.querySelector(".draft-pr-loading") as HTMLElement;
    expect(loadingEl.style.display).not.toBe("none");

    const cancelBtn = panel.element.querySelector(".draft-pr-cancel-btn") as HTMLButtonElement;
    cancelBtn.click();

    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    rejectResponse(abortError);

    await flush();

    const idleEl = panel.element.querySelector(".draft-pr-idle") as HTMLElement;
    expect(idleEl.style.display).not.toBe("none");
    expect(loadingEl.style.display).toBe("none");
  });

  it("504 timeout error: shows correct message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "draft_pr_timeout", message: "timed out", details: {} }), { status: 504 }),
    ));

    const panel = mountPanel();
    panel.fetch();

    await flush();

    const errorEl = panel.element.querySelector(".draft-pr-error") as HTMLElement;
    const errorMsg = panel.element.querySelector(".draft-pr-error-msg") as HTMLElement;
    expect(errorEl.style.display).not.toBe("none");
    expect(errorMsg.textContent).toContain("timed out");
  });

  it("500 parse error: shows correct message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "draft_pr_parse_error", message: "parse error", details: {} }), { status: 500 }),
    ));

    const panel = mountPanel();
    panel.fetch();

    await flush();

    const errorEl = panel.element.querySelector(".draft-pr-error") as HTMLElement;
    const errorMsg = panel.element.querySelector(".draft-pr-error-msg") as HTMLElement;
    expect(errorEl.style.display).not.toBe("none");
    expect(errorMsg.textContent).toContain("unparseable");
  });

  it("422 no-branch: shows correct message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "invalid_transition", message: "task has no branch artifact", details: {} }), { status: 422 }),
    ));

    const panel = mountPanel();
    panel.fetch();

    await flush();

    const errorEl = panel.element.querySelector(".draft-pr-error") as HTMLElement;
    const errorMsg = panel.element.querySelector(".draft-pr-error-msg") as HTMLElement;
    expect(errorEl.style.display).not.toBe("none");
    expect(errorMsg.textContent).toContain("no branch");
  });

  it("503 not configured: shows correct message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "internal_error", message: "draft-pr service not configured" }), { status: 503 }),
    ));

    const panel = mountPanel();
    panel.fetch();

    await flush();

    const errorEl = panel.element.querySelector(".draft-pr-error") as HTMLElement;
    const errorMsg = panel.element.querySelector(".draft-pr-error-msg") as HTMLElement;
    expect(errorEl.style.display).not.toBe("none");
    expect(errorMsg.textContent).toContain("not configured");
  });

  it("Re-draft button triggers new fetch", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "First", body: "First body" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Second", body: "Second body" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const panel = mountPanel();
    panel.fetch();

    await flush();

    const loadedEl = panel.element.querySelector(".draft-pr-loaded") as HTMLElement;
    expect(loadedEl.style.display).not.toBe("none");

    const redraftBtn = panel.element.querySelector(".draft-pr-redraft-btn") as HTMLButtonElement;
    redraftBtn.click();

    await flush();

    const titleInput = panel.element.querySelector(".draft-pr-title-input") as HTMLInputElement;
    expect(titleInput.value).toBe("Second");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("onDraft callback is called with title and body on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ title: "My PR", body: "Changes" }), { status: 200 }),
    ));

    const onDraft = vi.fn();
    const panel = mountPanel(onDraft);
    panel.fetch();

    await flush();

    expect(onDraft).toHaveBeenCalledWith({ title: "My PR", body: "Changes" });
  });

  it("Retry button in error state triggers new fetch", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "draft_pr_timeout", message: "timeout" }), { status: 504 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "OK", body: "Body" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const panel = mountPanel();
    panel.fetch();

    await flush();

    const errorEl = panel.element.querySelector(".draft-pr-error") as HTMLElement;
    expect(errorEl.style.display).not.toBe("none");

    const retryBtn = panel.element.querySelector(".draft-pr-retry-btn") as HTMLButtonElement;
    retryBtn.click();

    await flush();

    const loadedEl = panel.element.querySelector(".draft-pr-loaded") as HTMLElement;
    expect(loadedEl.style.display).not.toBe("none");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
