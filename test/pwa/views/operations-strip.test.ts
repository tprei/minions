import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createOperationsStrip } from "../../../pwa/assets/views/operations-strip.js";

function makeOp(overrides: Record<string, unknown> = {}) {
  return {
    id: "op-1",
    workflowId: "wf-1",
    kind: "restack",
    targetNodeId: "task-a",
    affectedNodeIds: ["task-a", "task-b"],
    fromBase: "abc123",
    toBase: "def456",
    status: "conflict",
    attempt: 1,
    idempotencyKey: "key-1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:01:00Z",
    ...overrides,
  };
}

function makeWorkflow(ops: Record<string, unknown> = {}, policyOverrides: Record<string, unknown> = {}) {
  return {
    id: "wf-1",
    kind: "manual-dag",
    status: "active",
    graph: {},
    operations: ops,
    policy: { maxConcurrent: 1, autoLand: false, autoMergeOnGreen: false, ...policyOverrides },
    version: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => makeWorkflow({ "op-1": makeOp() }),
  } as unknown as Response));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createOperationsStrip", () => {
  it("renders root element with operations-strip class", () => {
    const wf = makeWorkflow({ "op-1": makeOp() });
    const { element, destroy } = createOperationsStrip({ workflow: wf, deps: {} });
    expect(element.className).toContain("operations-strip");
    destroy();
  });

  it("renders a card for each in-flight operation", () => {
    const wf = makeWorkflow({
      "op-1": makeOp({ id: "op-1" }),
      "op-2": makeOp({ id: "op-2", targetNodeId: "task-c", affectedNodeIds: ["task-c"] }),
    });
    const { element, destroy } = createOperationsStrip({ workflow: wf, deps: {} });
    document.body.appendChild(element);

    const cards = element.querySelectorAll(".op-card");
    expect(cards.length).toBe(2);
    destroy();
  });

  it("shows no cards when all operations are completed", () => {
    const wf = makeWorkflow({
      "op-1": makeOp({ status: "completed" }),
    });
    const { element, destroy } = createOperationsStrip({ workflow: wf, deps: {} });
    document.body.appendChild(element);

    const cards = element.querySelectorAll(".op-card");
    expect(cards.length).toBe(0);
    expect(element.style.display).toBe("none");
    destroy();
  });

  it("renders kind badge with 'Restack' for restack kind", () => {
    const wf = makeWorkflow({ "op-1": makeOp() });
    const { element, destroy } = createOperationsStrip({ workflow: wf, deps: {} });
    document.body.appendChild(element);

    const badge = element.querySelector(".op-kind-badge");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe("Restack");
    destroy();
  });

  it("renders affected task chips", () => {
    const wf = makeWorkflow({ "op-1": makeOp({ affectedNodeIds: ["task-a", "task-b"] }) });
    const { element, destroy } = createOperationsStrip({ workflow: wf, deps: {} });
    document.body.appendChild(element);

    const chips = element.querySelectorAll(".op-task-chip");
    expect(chips.length).toBe(2);
    expect(chips[0]?.textContent).toBe("task-a");
    expect(chips[1]?.textContent).toBe("task-b");
    destroy();
  });

  it("calls onTaskFocus when a task chip is clicked", () => {
    const onTaskFocus = vi.fn();
    const wf = makeWorkflow({ "op-1": makeOp({ affectedNodeIds: ["task-a"] }) });
    const { element, destroy } = createOperationsStrip({ workflow: wf, deps: { onTaskFocus } });
    document.body.appendChild(element);

    const chip = element.querySelector(".op-task-chip") as HTMLButtonElement | null;
    chip?.click();
    expect(onTaskFocus).toHaveBeenCalledWith("task-a");
    destroy();
  });

  it("renders conflict explainer as sanitized markdown", () => {
    const wf = makeWorkflow({
      "op-1": makeOp({ error: "Conflict on `main`\n\n<script>alert('xss')</script>" }),
    });
    const { element, destroy } = createOperationsStrip({ workflow: wf, deps: {} });
    document.body.appendChild(element);

    const explainer = element.querySelector(".op-explainer");
    expect(explainer).not.toBeNull();
    expect(explainer?.innerHTML).not.toContain("<script>");
    expect(explainer?.textContent).toContain("Conflict on");
    destroy();
  });

  it("XSS in conflict explainer is sanitized", () => {
    const wf = makeWorkflow({
      "op-1": makeOp({ error: "<img src=x onerror='alert(1)'> bad content" }),
    });
    const { element, destroy } = createOperationsStrip({ workflow: wf, deps: {} });
    document.body.appendChild(element);

    const explainer = element.querySelector(".op-explainer");
    const html = explainer?.innerHTML ?? "";
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert(");
    destroy();
  });

  it("resolve button is enabled when op has conflict status and fromBase", () => {
    const wf = makeWorkflow({
      "op-1": makeOp({ status: "conflict", fromBase: "abc123" }),
    });
    const { element, destroy } = createOperationsStrip({ workflow: wf, deps: {} });
    document.body.appendChild(element);

    const btn = element.querySelector(".op-resolve-btn") as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn?.disabled).toBe(false);
    destroy();
  });

  it("resolve button is disabled when op status is not conflict", () => {
    const wf = makeWorkflow({
      "op-1": makeOp({ status: "running", fromBase: "abc123" }),
    });
    const { element, destroy } = createOperationsStrip({ workflow: wf, deps: {} });
    document.body.appendChild(element);

    const btn = element.querySelector(".op-resolve-btn") as HTMLButtonElement | null;
    expect(btn?.disabled).toBe(true);
    destroy();
  });

  it("resolve button is disabled when fromBase is missing", () => {
    const wf = makeWorkflow({
      "op-1": makeOp({ status: "conflict", fromBase: undefined }),
    });
    const { element, destroy } = createOperationsStrip({ workflow: wf, deps: {} });
    document.body.appendChild(element);

    const btn = element.querySelector(".op-resolve-btn") as HTMLButtonElement | null;
    expect(btn?.disabled).toBe(true);
    destroy();
  });

  it("resolve button posts correct command shape when clicked", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const wf = makeWorkflow({
      "op-1": makeOp({ status: "conflict", fromBase: "abc123", idempotencyKey: "idem-1" }),
    });
    const { element, destroy } = createOperationsStrip({ workflow: wf, deps: {} });
    document.body.appendChild(element);

    const btn = element.querySelector(".op-resolve-btn") as HTMLButtonElement | null;
    btn?.click();

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/commands", expect.objectContaining({
        method: "POST",
      }));
    });

    const call = mockFetch.mock.calls.find((c: unknown[]) => c[0] === "/commands");
    const body = JSON.parse((call?.[1] as RequestInit | undefined)?.body as string ?? "{}");
    expect(body.kind).toBe("request-restack");
    expect(body.workflowId).toBe("wf-1");
    expect(body.input.operationId).toBe("op-1");
    expect(body.input.ancestorId).toBe("abc123");
    expect(body.input.idempotencyKey).toBe("idem-1");
    expect(typeof body.input.now).toBe("string");
    destroy();
  });

  it("dismiss button hides the card without removing engine operation", () => {
    const wf = makeWorkflow({ "op-1": makeOp() });
    const { element, destroy } = createOperationsStrip({ workflow: wf, deps: {} });
    document.body.appendChild(element);

    const card = element.querySelector(".op-card") as HTMLElement | null;
    expect(card).not.toBeNull();

    const closeBtn = element.querySelector(".op-card-close-btn") as HTMLButtonElement | null;
    closeBtn?.click();

    expect(card?.style.display).toBe("none");

    const cards = element.querySelectorAll(".op-card");
    expect(cards.length).toBe(1);
    destroy();
  });

  it("update() re-renders with new workflow operations", () => {
    const wf = makeWorkflow({});
    const { element, update, destroy } = createOperationsStrip({ workflow: wf, deps: {} });
    document.body.appendChild(element);

    expect(element.querySelectorAll(".op-card").length).toBe(0);

    const wf2 = makeWorkflow({ "op-1": makeOp() });
    update(wf2);

    expect(element.querySelectorAll(".op-card").length).toBe(1);
    destroy();
  });

  it("destroy() removes element from DOM", () => {
    const wf = makeWorkflow({ "op-1": makeOp() });
    const { element, destroy } = createOperationsStrip({ workflow: wf, deps: {} });
    document.body.appendChild(element);
    destroy();
    expect(document.body.contains(element)).toBe(false);
  });
});
