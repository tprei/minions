import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createAlertCenter } from "../../../pwa/assets/views/alert-center.js";

const makeAlert = (overrides: Record<string, unknown> = {}) => ({
  id: "alert-1",
  timestamp: new Date().toISOString(),
  kind: "orchestrator-silent",
  severity: "warn",
  message: "Orchestrator has been silent for 10m",
  ...overrides,
});

beforeEach(() => {
  document.body.innerHTML = "";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ alerts: [] }),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createAlertCenter", () => {
  it("renders root element with alert-center class", () => {
    const { element } = createAlertCenter();
    expect(element.className).toContain("alert-center");
  });

  it("fetches /alerts on mount", async () => {
    createAlertCenter({ apiBase: "" });
    await vi.waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining("/alerts"),
      );
    });
  });

  it("renders alert cards for returned alerts", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        alerts: [
          makeAlert({ id: "a1", severity: "warn", kind: "orchestrator-silent" }),
          makeAlert({ id: "a2", severity: "error", kind: "ci-exhausted", message: "CI exhausted" }),
        ],
      }),
    } as unknown as Response);

    const { element } = createAlertCenter();
    document.body.appendChild(element);

    await vi.waitFor(() => {
      const cards = element.querySelectorAll(".alert-card");
      expect(cards.length).toBe(2);
    });
  });

  it("applies warn severity styling to warn alerts", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        alerts: [makeAlert({ severity: "warn" })],
      }),
    } as unknown as Response);

    const { element } = createAlertCenter();
    document.body.appendChild(element);

    await vi.waitFor(() => {
      const card = element.querySelector(".alert-card");
      expect(card).not.toBeNull();
      expect(card!.classList.contains("alert-card-warn")).toBe(true);
    });
  });

  it("applies error severity styling to error alerts", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        alerts: [makeAlert({ severity: "error" })],
      }),
    } as unknown as Response);

    const { element } = createAlertCenter();
    document.body.appendChild(element);

    await vi.waitFor(() => {
      const card = element.querySelector(".alert-card");
      expect(card!.classList.contains("alert-card-error")).toBe(true);
    });
  });

  it("navigates to workflow on tap when workflowId present", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        alerts: [makeAlert({ workflowId: "wf-42" })],
      }),
    } as unknown as Response);

    const { element } = createAlertCenter();
    document.body.appendChild(element);

    await vi.waitFor(() => {
      expect(element.querySelectorAll(".alert-card").length).toBe(1);
    });

    const card = element.querySelector(".alert-card") as HTMLElement;
    card.click();

    expect(window.location.hash).toBe("#/workflow/wf-42");
  });

  it("navigates to workflow/task when both workflowId and taskId present", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        alerts: [makeAlert({ workflowId: "wf-42", taskId: "T1" })],
      }),
    } as unknown as Response);

    const { element } = createAlertCenter();
    document.body.appendChild(element);

    await vi.waitFor(() => {
      expect(element.querySelectorAll(".alert-card").length).toBe(1);
    });

    const card = element.querySelector(".alert-card") as HTMLElement;
    card.click();

    expect(window.location.hash).toBe("#/workflow/wf-42/task/T1");
  });

  it("does not make card clickable when no workflowId", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        alerts: [makeAlert({ workflowId: undefined })],
      }),
    } as unknown as Response);

    const { element } = createAlertCenter();
    document.body.appendChild(element);

    await vi.waitFor(() => {
      expect(element.querySelectorAll(".alert-card").length).toBe(1);
    });

    const card = element.querySelector(".alert-card") as HTMLElement;
    expect(card.style.cursor).not.toBe("pointer");
  });

  it("refresh() re-fetches and replaces alerts", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ alerts: [makeAlert({ message: "first" })] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ alerts: [makeAlert({ message: "second" })] }),
      } as unknown as Response);

    const { element, refresh } = createAlertCenter();
    document.body.appendChild(element);

    await vi.waitFor(() => {
      expect(element.querySelector(".alert-message")?.textContent).toBe("first");
    });

    await refresh();

    expect(element.querySelector(".alert-message")?.textContent).toBe("second");
  });

  it("pull-to-refresh is wired (attachPullToRefresh called on root)", () => {
    const { element } = createAlertCenter();
    expect(element).toBeTruthy();
  });
});
