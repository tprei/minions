import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { DraftPrPanel } from "../DraftPrPanel";

describe("DraftPrPanel", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("aborts the underlying fetch after 30s and surfaces a timeout banner", async () => {
    let capturedSignal: AbortSignal | undefined;
    let rejectFetch: ((reason: unknown) => void) | undefined;

    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        rejectFetch = reject;
        if (init?.signal) {
          init.signal.addEventListener("abort", () => {
            const err = new DOMException("aborted", "AbortError");
            reject(err);
          });
        }
      }) as Promise<Response>;
    }) as typeof fetch;

    render(<DraftPrPanel workflowId="wf-1" taskId="t-1" />);

    const draftBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Draft PR"),
    );
    expect(draftBtn).toBeDefined();

    fireEvent.click(draftBtn!);

    await act(async () => {
      await Promise.resolve();
    });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(capturedSignal?.aborted).toBe(true);
    expect(document.body.textContent).toContain("Timed out");

    if (rejectFetch !== undefined) {
      // already rejected via the abort listener; nothing more to do
    }
  });

  it("forwards a non-aborted fetch error verbatim", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "bad" }), { status: 500 }),
      ),
    ) as typeof fetch;

    render(<DraftPrPanel workflowId="wf-1" taskId="t-1" />);
    const draftBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Draft PR"),
    );
    fireEvent.click(draftBtn!);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("HTTP 500");
    expect(document.body.textContent).not.toContain("Timed out");
  });
});
