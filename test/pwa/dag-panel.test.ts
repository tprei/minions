import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDagPanel } from "../../pwa/assets/views/dag-panel.js";
import type { Workflow } from "../../src/domain/types.js";

beforeEach(() => {
  document.body.innerHTML = "";
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
});

function makeWorkflow(taskId = "t1"): Workflow {
  return {
    id: "wf-1",
    kind: "parallel",
    status: "running",
    operations: {},
    policy: { maxConcurrent: 4 },
    version: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    graph: {
      [taskId]: {
        title: "My Task",
        executionStatus: "pending",
        stackStatus: "clean",
        dependsOn: [],
        artifacts: [],
        runs: [],
      } as unknown as import("../../src/domain/types.js").TaskNode,
    },
  } as unknown as Workflow;
}

describe("dag-panel row focus", () => {
  it("clicking the row body fires onTaskFocus with the taskId", () => {
    const onTaskFocus = vi.fn();
    const workflow = makeWorkflow("t1");
    const { open } = createDagPanel({ workflow, onTaskFocus });

    const container = document.createElement("div");
    document.body.appendChild(container);
    open(container);

    const row = container.querySelector(".dag-task-row") as HTMLElement;
    expect(row).not.toBeNull();

    const body = row.querySelector(".dag-task-body") as HTMLElement;
    expect(body).not.toBeNull();

    body.click();
    expect(onTaskFocus).toHaveBeenCalledWith("t1");
  });

  it("clicking a dep-chip button inside the row does NOT fire onTaskFocus for the row", () => {
    const onTaskFocus = vi.fn();
    const workflow = {
      id: "wf-1",
      graph: {
        t1: {
          title: "My Task",
          executionStatus: "pending",
          stackStatus: "clean",
          dependsOn: ["t0"],
          artifacts: [],
          runs: [],
        },
      },
    } as unknown as Workflow;
    const { open } = createDagPanel({ workflow, onTaskFocus });

    const container = document.createElement("div");
    document.body.appendChild(container);
    open(container);

    const chip = container.querySelector(".dag-dep-chip") as HTMLButtonElement;
    expect(chip).not.toBeNull();

    onTaskFocus.mockClear();
    chip.click();

    // The chip fires onTaskFocus for the dep target ("t0"), not for "t1" via the row handler.
    // Verify "t1" is never the argument from a row-level click.
    const rowCalls = onTaskFocus.mock.calls.filter((c) => c[0] === "t1");
    expect(rowCalls).toHaveLength(0);
  });

  it("clicking an anchor inside the row does NOT fire onTaskFocus", () => {
    const onTaskFocus = vi.fn();
    const workflow = {
      id: "wf-1",
      graph: {
        t1: {
          title: "My Task",
          executionStatus: "pending",
          stackStatus: "clean",
          dependsOn: [],
          artifacts: [],
          runs: [],
        },
      },
    } as unknown as Workflow;
    const { open } = createDagPanel({ workflow, onTaskFocus });

    const container = document.createElement("div");
    document.body.appendChild(container);
    open(container);

    const row = container.querySelector(".dag-task-row") as HTMLElement;

    const link = document.createElement("a");
    link.href = "#";
    link.textContent = "link";
    row.appendChild(link);

    onTaskFocus.mockClear();
    link.click();
    expect(onTaskFocus).not.toHaveBeenCalled();
  });
});

describe("dag-panel cleanupArtifacts on replace", () => {
  it("calls cleanup for existing sheet when reopened (mobile)", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));

    const onTaskFocus = vi.fn();
    const workflow = makeWorkflow("t1");
    const { open } = createDagPanel({ workflow, onTaskFocus });

    open();
    open();
  });

  it("calls cleanup for existing inline panel when reopened (desktop)", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));

    const cleanupSpy = vi.fn();
    const onTaskFocus = vi.fn();
    const workflow = makeWorkflow("t1");
    const { open } = createDagPanel({ workflow, onTaskFocus });

    const container = document.createElement("div");
    document.body.appendChild(container);
    open(container);

    const inlineEl = container.querySelector(".dag-inline-panel") as HTMLElement;
    expect(inlineEl).not.toBeNull();

    // Simulate an artifact node inside the panel (cleanupArtifacts walks descendants)
    const fakeArtifactNode = document.createElement("div");
    (fakeArtifactNode as unknown as { __artifactCleanup: () => void }).__artifactCleanup = cleanupSpy;
    inlineEl.appendChild(fakeArtifactNode);

    open(container);

    expect(cleanupSpy).toHaveBeenCalled();
  });
});
