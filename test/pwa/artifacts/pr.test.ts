import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "../../../pwa/assets/artifacts/pr.js";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  document.body.innerHTML = "";
});

describe("pr renderer", () => {
  it("renders a link with the PR url", () => {
    const artifact = {
      kind: "pr" as const,
      ref: "https://api.github.com/repos/org/repo/pulls/42",
      producedBy: "t1",
      createdAt: "2026-01-01T00:00:00Z",
    };
    const el = render(artifact);
    expect(el.className).toContain("artifact-pr");
    const link = el.querySelector(".artifact-pr-url") as HTMLAnchorElement;
    expect(link.href).toContain("api.github.com");
  });

  it("shows Loading… initially when githubProxy provided", () => {
    const mockFetch = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", mockFetch);
    const artifact = {
      kind: "pr" as const,
      ref: "https://api.github.com/repos/org/repo/pulls/42",
      producedBy: "t1",
      createdAt: "2026-01-01T00:00:00Z",
    };
    const el = render(artifact, { githubProxy: "/github/pr-detail" });
    const detail = el.querySelector(".artifact-pr-detail") as HTMLElement;
    expect(detail.textContent).toContain("Loading");
  });

  it("renders PR detail when fetch resolves", async () => {
    const prData = {
      title: "My PR",
      state: "open",
      user: { login: "alice", avatar_url: "" },
      body: "PR body",
    };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(prData), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    vi.stubGlobal("fetch", mockFetch);

    const artifact = {
      kind: "pr" as const,
      ref: "https://api.github.com/repos/org/repo/pulls/42",
      producedBy: "t1",
      createdAt: "2026-01-01T00:00:00Z",
    };
    const el = render(artifact, { githubProxy: "/github/pr-detail" });

    await vi.waitFor(() => {
      const title = el.querySelector(".artifact-pr-title");
      expect(title?.textContent).toBe("My PR");
    }, { timeout: 1000 });

    const statePill = el.querySelector(".pr-state-pill");
    expect(statePill?.textContent).toBe("open");
  });

  it("does not fetch when githubProxy is not provided", () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    const artifact = {
      kind: "pr" as const,
      ref: "https://github.com/org/repo/pull/42",
      producedBy: "t1",
      createdAt: "2026-01-01T00:00:00Z",
    };
    render(artifact);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("__artifactCleanup removes window focus listener when called", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const artifact = {
      kind: "pr" as const,
      ref: "https://github.com/org/repo/pull/99",
      producedBy: "t1",
      createdAt: "2026-01-01T00:00:00Z",
    };
    const el = render(artifact);

    const addCount = addSpy.mock.calls.filter((c) => c[0] === "focus").length;
    expect(addCount).toBe(1);

    const removeCountBefore = removeSpy.mock.calls.filter((c) => c[0] === "focus").length;

    expect(typeof (el as unknown as { __artifactCleanup: unknown }).__artifactCleanup).toBe("function");
    (el as unknown as { __artifactCleanup: () => void }).__artifactCleanup();

    const removeCountAfter = removeSpy.mock.calls.filter((c) => c[0] === "focus").length;
    expect(removeCountAfter).toBe(removeCountBefore + 1);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
