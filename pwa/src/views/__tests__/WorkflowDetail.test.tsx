import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import type { Workflow, WorkflowEvent } from "../../domain/types";

vi.mock("../../transport/rest", () => ({
  getWorkflow: vi.fn(),
  postCommand: vi.fn().mockResolvedValue(undefined),
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  listeners: Map<string, Array<(e: MessageEvent) => void>> = new Map();
  readyState = 0;
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: (e: MessageEvent) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  emitNamed(name: string, payload: unknown): void {
    const fns = this.listeners.get(name) ?? [];
    for (const fn of fns) {
      fn({ data: JSON.stringify(payload) } as MessageEvent);
    }
  }
}

import { WorkflowDetail } from "../WorkflowDetail";
import { getWorkflow, postCommand } from "../../transport/rest";
import { useWorkflowStore } from "../../store/useWorkflowStore";

function makeRunningWorkflow(): Workflow {
  return {
    id: "wf-1",
    kind: "single-task",
    status: "active",
    graph: {
      "t-1": {
        id: "t-1",
        workflowId: "wf-1",
        title: "demo task",
        prompt: "do work",
        dependsOn: [],
        executionStatus: "running",
        stackStatus: "clean",
        priority: 0,
        claims: [],
        contract: { summary: "", expectedArtifacts: [] },
        artifacts: [],
        runs: [],
        readiness: "ready",
        version: 1,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
    },
    operations: {},
    policy: { maxConcurrent: 1, autoLand: false, autoMergeOnGreen: false },
    version: 1,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  };
}

describe("WorkflowDetail", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.mocked(getWorkflow).mockResolvedValue(makeRunningWorkflow());
    vi.mocked(postCommand).mockClear();
    vi.mocked(postCommand).mockResolvedValue(undefined);
    useWorkflowStore.setState({ workflows: new Map(), summaries: undefined });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function renderAndLoad(): Promise<void> {
    render(<WorkflowDetail id="wf-1" />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("opens exactly one EventSource when WorkflowDetail (with TranscriptView) renders", async () => {
    await renderAndLoad();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe("/workflows/wf-1/events");
  });

  it("sends a queued message via continue-task when the task transitions out of running", async () => {
    await renderAndLoad();

    const queueButton = document.querySelector("button.btn-secondary");
    expect(queueButton).not.toBeNull();

    const textarea = document.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    fireEvent.change(textarea!, { target: { value: "follow up please" } });

    const queueBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Queue"),
    );
    expect(queueBtn).toBeDefined();
    fireEvent.click(queueBtn!);

    expect(document.body.textContent).toContain("follow up please");

    expect(postCommand).not.toHaveBeenCalled();

    const es = FakeEventSource.instances[0];
    const transitionEvent: WorkflowEvent = {
      cursor: 1,
      workflowId: "wf-1",
      occurredAt: "2025-01-01T00:00:01Z",
      kind: "task-transitioned",
      payload: {
        taskId: "t-1",
        fromExecutionStatus: "running",
        toExecutionStatus: "completed",
        fromStackStatus: "clean",
        toStackStatus: "clean",
        taskVersion: 2,
      },
    };

    await act(async () => {
      es.emitNamed("task-transitioned", transitionEvent);
      await Promise.resolve();
    });

    expect(postCommand).toHaveBeenCalledTimes(1);
    expect(postCommand).toHaveBeenCalledWith({
      kind: "continue-task",
      workflowId: "wf-1",
      taskId: "t-1",
      prompt: "follow up please",
    });
  });

  it("clears the queued message after a successful send", async () => {
    await renderAndLoad();
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "queued send" } });
    const queueBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Queue"),
    );
    fireEvent.click(queueBtn!);
    expect(document.body.textContent).toContain("queued send");

    const es = FakeEventSource.instances[0];
    await act(async () => {
      es.emitNamed("task-transitioned", {
        cursor: 1,
        workflowId: "wf-1",
        occurredAt: "2025-01-01T00:00:01Z",
        kind: "task-transitioned",
        payload: {
          taskId: "t-1",
          fromExecutionStatus: "running",
          toExecutionStatus: "completed",
          fromStackStatus: "clean",
          toStackStatus: "clean",
          taskVersion: 2,
        },
      });
      await Promise.resolve();
    });

    expect(document.body.textContent).not.toContain("Queued: \"queued send\"");
  });

  it("does NOT send the queued message if the transition is to a still-running status", async () => {
    await renderAndLoad();
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "still queued" } });
    const queueBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Queue"),
    );
    fireEvent.click(queueBtn!);

    const es = FakeEventSource.instances[0];
    await act(async () => {
      es.emitNamed("task-transitioned", {
        cursor: 1,
        workflowId: "wf-1",
        occurredAt: "2025-01-01T00:00:01Z",
        kind: "task-transitioned",
        payload: {
          taskId: "t-1",
          fromExecutionStatus: "running",
          toExecutionStatus: "quality-pending",
          fromStackStatus: "clean",
          toStackStatus: "clean",
          taskVersion: 2,
        },
      });
      await Promise.resolve();
    });

    expect(postCommand).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("still queued");
  });
});
