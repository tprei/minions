import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createPrTab } from "../../../pwa/assets/views/pr-tab.js";

const MOCK_PR_DETAIL = {
  title: "Add feature X",
  state: "open",
  mergeable: "clean",
  mergeable_state: "clean",
  user: { login: "alice", avatar_url: "https://example.com/avatar.png" },
  head: { ref: "feat/x" },
  base: { ref: "main" },
  files: [],
};

let prCounter = 1000;

function makePrTask(prNumber?: number, artifactOverrides: Record<string, unknown> = {}) {
  const num = prNumber ?? prCounter++;
  return {
    id: "T1",
    title: "Test task",
    executionStatus: "pr-open",
    stackStatus: "clean",
    dependsOn: [],
    artifacts: [
      { kind: "pr", ref: `https://github.com/org/repo/pull/${num}`, producedBy: "T1", createdAt: "2026-01-01T00:00:00Z", ...artifactOverrides },
    ],
    runs: [],
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ...MOCK_PR_DETAIL }),
  } as unknown as Response));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createPrTab", () => {
  it("renders root element with pr-tab class", () => {
    const { element, destroy } = createPrTab({ task: makePrTask(), workflow: { id: "wf-1" }, deps: {} });
    expect(element.className).toContain("pr-tab");
    destroy();
  });

  it("renders hidden element when no PR artifact", () => {
    const task = { id: "T1", title: "t", executionStatus: "pr-open", stackStatus: "clean", dependsOn: [], artifacts: [], runs: [] };
    const { element, destroy } = createPrTab({ task, workflow: { id: "wf-1" }, deps: {} });
    expect(element.style.display).toBe("none");
    destroy();
  });

  it("renders title after fetch resolves", async () => {
    const { element, destroy } = createPrTab({
      task: makePrTask(),
      workflow: { id: "wf-1" },
      deps: { githubProxy: "/github/pr-detail" },
    });
    document.body.appendChild(element);

    await vi.waitFor(() => {
      const title = element.querySelector(".pr-tab-title");
      expect(title?.textContent).toBe("Add feature X");
    });
    destroy();
  });

  it("renders state pill with open state", async () => {
    const { element, destroy } = createPrTab({
      task: makePrTask(),
      workflow: { id: "wf-1" },
      deps: { githubProxy: "/github/pr-detail" },
    });
    document.body.appendChild(element);

    await vi.waitFor(() => {
      const pill = element.querySelector(".pr-state-pill");
      expect(pill?.textContent).toBe("open");
      expect(pill?.classList.contains("pr-state-open")).toBe(true);
    });
    destroy();
  });

  it("renders mergeable badge with clean state", async () => {
    const { element, destroy } = createPrTab({
      task: makePrTask(),
      workflow: { id: "wf-1" },
      deps: { githubProxy: "/github/pr-detail" },
    });
    document.body.appendChild(element);

    await vi.waitFor(() => {
      const badge = element.querySelector(".pr-mergeable-badge");
      expect(badge?.textContent).toBe("clean");
      expect(badge?.classList.contains("mergeable-clean")).toBe(true);
    });
    destroy();
  });

  it("renders author chip with login and avatar", async () => {
    const { element, destroy } = createPrTab({
      task: makePrTask(),
      workflow: { id: "wf-1" },
      deps: { githubProxy: "/github/pr-detail" },
    });
    document.body.appendChild(element);

    await vi.waitFor(() => {
      const chip = element.querySelector(".pr-author-chip");
      expect(chip).not.toBeNull();
      expect(chip?.textContent).toContain("alice");
    });
    destroy();
  });

  it("renders branch refs", async () => {
    const { element, destroy } = createPrTab({
      task: makePrTask(),
      workflow: { id: "wf-1" },
      deps: { githubProxy: "/github/pr-detail" },
    });
    document.body.appendChild(element);

    await vi.waitFor(() => {
      const refs = element.querySelector(".pr-refs");
      expect(refs?.textContent).toContain("feat/x");
      expect(refs?.textContent).toContain("main");
    });
    destroy();
  });

  it("shows Land button enabled when mergeable is clean", async () => {
    const { element, destroy } = createPrTab({
      task: makePrTask(),
      workflow: { id: "wf-1" },
      deps: { githubProxy: "/github/pr-detail" },
    });
    document.body.appendChild(element);

    await vi.waitFor(() => {
      const btn = element.querySelector(".pr-tab-land-btn") as HTMLButtonElement | null;
      expect(btn).not.toBeNull();
      expect(btn?.disabled).toBe(false);
    });
    destroy();
  });

  it("shows Land button disabled when mergeable is dirty", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ ...MOCK_PR_DETAIL, mergeable: "dirty", mergeable_state: "dirty" }),
    } as unknown as Response);

    const { element, destroy } = createPrTab({
      task: makePrTask(prCounter++),
      workflow: { id: "wf-1" },
      deps: { githubProxy: "/github/pr-detail" },
    });
    document.body.appendChild(element);

    await vi.waitFor(() => {
      const btn = element.querySelector(".pr-tab-land-btn") as HTMLButtonElement | null;
      expect(btn?.disabled).toBe(true);
    });
    destroy();
  });

  it("shows helper text with mergeable value when not clean", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ ...MOCK_PR_DETAIL, mergeable: "blocked", mergeable_state: "blocked" }),
    } as unknown as Response);

    const { element, destroy } = createPrTab({
      task: makePrTask(prCounter++),
      workflow: { id: "wf-1" },
      deps: { githubProxy: "/github/pr-detail" },
    });
    document.body.appendChild(element);

    await vi.waitFor(() => {
      const helper = element.querySelector(".pr-tab-land-helper");
      expect(helper).not.toBeNull();
      expect(helper?.textContent).toContain("blocked");
    });
    destroy();
  });

  it("shows Land button disabled when mergeable is undefined", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ title: "PR", state: "open", user: { login: "bob", avatar_url: "" } }),
    } as unknown as Response);

    const { element, destroy } = createPrTab({
      task: makePrTask(prCounter++),
      workflow: { id: "wf-1" },
      deps: { githubProxy: "/github/pr-detail" },
    });
    document.body.appendChild(element);

    await vi.waitFor(() => {
      const btn = element.querySelector(".pr-tab-land-btn") as HTMLButtonElement | null;
      expect(btn?.disabled).toBe(true);
    });
    destroy();
  });

  it("destroy() removes element from DOM", () => {
    const { element, destroy } = createPrTab({ task: makePrTask(), workflow: { id: "wf-1" }, deps: {} });
    document.body.appendChild(element);
    destroy();
    expect(document.body.contains(element)).toBe(false);
  });
});
