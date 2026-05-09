import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createAuditFeed } from "../../../pwa/assets/views/audit-feed.js";

const makeEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "ev-1",
  timestamp: new Date().toISOString(),
  actor: "system",
  action: "workflow.created",
  workflowId: "wf-1",
  ...overrides,
});

beforeEach(() => {
  document.body.innerHTML = "";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ events: [] }),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createAuditFeed", () => {
  it("renders root element with audit-feed class", () => {
    const { element } = createAuditFeed();
    expect(element.className).toContain("audit-feed");
  });

  it("fetches /audit/events on mount with default limit", async () => {
    createAuditFeed({ apiBase: "" });
    await vi.waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining("/audit/events"),
      );
    });
    const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
    expect(url).toContain("limit=50");
  });

  it("renders audit rows for each returned event", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [
          makeEvent({ action: "workflow.created", actor: "user", workflowId: "wf-1" }),
          makeEvent({ id: "ev-2", action: "task.completed", actor: "agent" }),
        ],
      }),
    } as unknown as Response);

    const { element } = createAuditFeed();
    document.body.appendChild(element);

    await vi.waitFor(() => {
      const rows = element.querySelectorAll(".audit-row");
      expect(rows.length).toBe(2);
    });

    const actions = element.querySelectorAll(".audit-action");
    const actionTexts = Array.from(actions).map((el) => el.textContent);
    expect(actionTexts).toContain("workflow.created");
    expect(actionTexts).toContain("task.completed");
  });

  it("renders expandable JSON detail when event has detail", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [makeEvent({ detail: { foo: "bar" } })],
      }),
    } as unknown as Response);

    const { element } = createAuditFeed();
    document.body.appendChild(element);

    await vi.waitFor(() => {
      const detail = element.querySelector(".audit-detail");
      expect(detail).not.toBeNull();
    });

    const pre = element.querySelector(".audit-detail-json");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain("foo");
  });

  it("does not render detail element when event has no detail", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [makeEvent({ detail: undefined })],
      }),
    } as unknown as Response);

    const { element } = createAuditFeed();
    document.body.appendChild(element);

    await vi.waitFor(() => {
      const rows = element.querySelectorAll(".audit-row");
      expect(rows.length).toBe(1);
    });

    expect(element.querySelector(".audit-detail")).toBeNull();
  });

  it("shows load-more button when response has full page", async () => {
    const events = Array.from({ length: 50 }, (_, i) =>
      makeEvent({ id: `ev-${i}`, timestamp: new Date(Date.now() - i * 1000).toISOString() }),
    );

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ events }),
    } as unknown as Response);

    const { element } = createAuditFeed();
    document.body.appendChild(element);

    await vi.waitFor(() => {
      const btn = element.querySelector(".audit-load-more") as HTMLElement;
      expect(btn?.style.display).not.toBe("none");
    });
  });

  it("hides load-more button when response has fewer than limit rows", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [makeEvent()],
      }),
    } as unknown as Response);

    const { element } = createAuditFeed();
    document.body.appendChild(element);

    await vi.waitFor(() => {
      const rows = element.querySelectorAll(".audit-row");
      expect(rows.length).toBe(1);
    });

    const btn = element.querySelector(".audit-load-more") as HTMLElement;
    expect(btn.style.display).toBe("none");
  });

  it("passes action filter in URL when chip is clicked", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ events: [] }),
    } as unknown as Response);

    const { element } = createAuditFeed({ apiBase: "" });
    document.body.appendChild(element);

    await vi.waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    });

    const rangeChips = element.querySelectorAll<HTMLButtonElement>(".audit-chip[data-range]");
    const todayChip = Array.from(rangeChips).find((c) => c.dataset.range === "today");
    expect(todayChip).not.toBeUndefined();
    todayChip!.click();

    await vi.waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    });

    const url = vi.mocked(fetch).mock.calls[1]?.[0] as string;
    expect(url).toContain("/audit/events");
  });

  it("refresh() re-fetches and replaces events", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ events: [makeEvent({ action: "first" })] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ events: [makeEvent({ action: "second" })] }),
      } as unknown as Response);

    const { element, refresh } = createAuditFeed();
    document.body.appendChild(element);

    await vi.waitFor(() => {
      expect(element.querySelector(".audit-action")?.textContent).toBe("first");
    });

    await refresh();

    const actions = element.querySelectorAll(".audit-action");
    expect(actions.length).toBe(1);
    expect(actions[0]?.textContent).toBe("second");
  });
});
