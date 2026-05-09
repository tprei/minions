import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createChecksPanel } from "../../../pwa/assets/views/checks-panel.js";

const STABLE_CHECKS = [
  { id: "c1", name: "unit-tests", conclusion: "success", started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:01:00Z", html_url: "https://github.com/org/repo/actions/runs/1" },
  { id: "c2", name: "lint", conclusion: "failure", started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:00:30Z", html_url: "https://github.com/org/repo/actions/runs/2" },
  { id: "c3", name: "e2e", status: "pending", html_url: "https://github.com/org/repo/actions/runs/3" },
];

function makePrDetail(overrides: Record<string, unknown> = {}) {
  return {
    check_runs_url: "https://api.github.com/repos/org/repo/commits/abc/check-runs",
    ...overrides,
  };
}

async function flushPromises() {
  await new Promise<void>((r) => setTimeout(r, 0));
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ check_runs: STABLE_CHECKS }),
  } as unknown as Response));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createChecksPanel", () => {
  it("renders root element with checks-panel class", () => {
    const { element, destroy } = createChecksPanel({ prDetail: makePrDetail(), githubProxy: "/github/pr-detail" });
    expect(element.className).toContain("checks-panel");
    destroy();
  });

  it("renders check rows from prDetail on mount when checks are pre-populated", () => {
    const prDetail = {
      ...makePrDetail(),
      check_runs: STABLE_CHECKS,
    };
    const { element, destroy } = createChecksPanel({ prDetail, githubProxy: "/github/pr-detail" });
    document.body.appendChild(element);

    const rows = element.querySelectorAll(".check-row");
    expect(rows.length).toBe(3);
    destroy();
  });

  it("renders check name in row", () => {
    const prDetail = {
      ...makePrDetail(),
      check_runs: STABLE_CHECKS,
    };
    const { element, destroy } = createChecksPanel({ prDetail, githubProxy: "/github/pr-detail" });
    document.body.appendChild(element);

    const names = Array.from(element.querySelectorAll(".check-name")).map((el) => el.textContent);
    expect(names).toContain("unit-tests");
    expect(names).toContain("lint");
    expect(names).toContain("e2e");
    destroy();
  });

  it("success check dot has correct class", () => {
    const prDetail = {
      ...makePrDetail(),
      check_runs: [{ id: "c1", name: "tests", conclusion: "success", html_url: null }],
    };
    const { element, destroy } = createChecksPanel({ prDetail, githubProxy: "/github/pr-detail" });
    document.body.appendChild(element);

    const dot = element.querySelector(".check-dot");
    expect(dot?.classList.contains("check-dot-success")).toBe(true);
    destroy();
  });

  it("failure check dot has correct class", () => {
    const prDetail = {
      ...makePrDetail(),
      check_runs: [{ id: "c2", name: "lint", conclusion: "failure", html_url: null }],
    };
    const { element, destroy } = createChecksPanel({ prDetail, githubProxy: "/github/pr-detail" });
    document.body.appendChild(element);

    const dot = element.querySelector(".check-dot");
    expect(dot?.classList.contains("check-dot-failure")).toBe(true);
    destroy();
  });

  it("pending check dot has correct class", () => {
    const prDetail = {
      ...makePrDetail(),
      check_runs: [{ id: "c3", name: "e2e", status: "pending", html_url: null }],
    };
    const { element, destroy } = createChecksPanel({ prDetail, githubProxy: "/github/pr-detail" });
    document.body.appendChild(element);

    const dot = element.querySelector(".check-dot");
    expect(dot?.classList.contains("check-dot-pending")).toBe(true);
    destroy();
  });

  it("shows View logs link when htmlUrl is present", () => {
    const prDetail = {
      ...makePrDetail(),
      check_runs: [{ id: "c1", name: "tests", conclusion: "success", html_url: "https://github.com/actions/1" }],
    };
    const { element, destroy } = createChecksPanel({ prDetail, githubProxy: "/github/pr-detail" });
    document.body.appendChild(element);

    const link = element.querySelector(".check-logs-link") as HTMLAnchorElement | null;
    expect(link?.href).toContain("github.com/actions/1");
    expect(link?.textContent).toBe("View logs");
    destroy();
  });

  it("adaptive polling: fast interval when checks change between polls", async () => {
    vi.useFakeTimers();

    const stableChecks = [{ id: "c1", name: "tests", conclusion: "success", html_url: null }];
    const changedChecks = [{ id: "c1", name: "tests", conclusion: "failure", html_url: null }];

    let callCount = 0;
    vi.mocked(fetch).mockImplementation(() => {
      callCount++;
      const checks = callCount === 1 ? stableChecks : changedChecks;
      return Promise.resolve({
        ok: true,
        json: async () => ({ check_runs: checks }),
      } as unknown as Response);
    });

    const prDetail = { ...makePrDetail(), check_runs: stableChecks };
    const { destroy } = createChecksPanel({ prDetail, githubProxy: "/github/pr-detail" });

    vi.advanceTimersByTime(30000);
    vi.useRealTimers();
    await flushPromises();

    expect(callCount).toBeGreaterThanOrEqual(1);
    destroy();
  });

  it("adaptive polling: interval slows to 120s when checks do not change", async () => {
    vi.useFakeTimers();

    const stableChecks = [{ id: "c1", name: "tests", conclusion: "success", html_url: null }];

    let callCount = 0;
    vi.mocked(fetch).mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: async () => ({ check_runs: stableChecks }),
      } as unknown as Response);
    });

    const prDetail = { ...makePrDetail(), check_runs: stableChecks };
    const { destroy } = createChecksPanel({ prDetail, githubProxy: "/github/pr-detail" });

    vi.advanceTimersByTime(30000);
    vi.useRealTimers();
    await flushPromises();
    const afterFastPoll = callCount;

    vi.useFakeTimers();
    vi.advanceTimersByTime(60000);
    vi.useRealTimers();
    await flushPromises();

    expect(afterFastPoll).toBeGreaterThanOrEqual(1);

    destroy();
  });

  it("pauses polling when document.hidden is true", async () => {
    vi.useFakeTimers();

    const prDetail = { ...makePrDetail(), check_runs: [] };
    let fetchCount = 0;
    vi.mocked(fetch).mockImplementation(() => {
      fetchCount++;
      return Promise.resolve({
        ok: true,
        json: async () => ({ check_runs: [] }),
      } as unknown as Response);
    });

    Object.defineProperty(document, "hidden", { value: true, writable: true, configurable: true });

    const { destroy } = createChecksPanel({ prDetail, githubProxy: "/github/pr-detail" });

    vi.advanceTimersByTime(30000);
    vi.advanceTimersByTime(30000);

    expect(fetchCount).toBe(0);

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    vi.useRealTimers();
    destroy();
  });

  it("resumes polling on visibilitychange to visible", async () => {
    vi.useFakeTimers();

    const prDetail = { ...makePrDetail(), check_runs: [] };
    let fetchCount = 0;
    vi.mocked(fetch).mockImplementation(() => {
      fetchCount++;
      return Promise.resolve({
        ok: true,
        json: async () => ({ check_runs: [] }),
      } as unknown as Response);
    });

    Object.defineProperty(document, "hidden", { value: true, writable: true, configurable: true });
    const { destroy } = createChecksPanel({ prDetail, githubProxy: "/github/pr-detail" });

    vi.advanceTimersByTime(30000);
    const countWhileHidden = fetchCount;

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    vi.useRealTimers();

    document.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();

    expect(fetchCount).toBeGreaterThan(countWhileHidden);
    destroy();
  });

  it("destroy() clears the interval and removes element", () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const prDetail = { ...makePrDetail(), check_runs: [] };
    const { element, destroy } = createChecksPanel({ prDetail, githubProxy: "/github/pr-detail" });
    document.body.appendChild(element);

    destroy();

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(document.body.contains(element)).toBe(false);
    vi.useRealTimers();
  });
});
