import { describe, expect, it } from "vitest";
import { transitionTask } from "../src/application/transitions.js";
import { createSingleTaskWorkflow } from "../src/domain/workflow.js";

const now = "2026-05-04T11:19:00.000Z";
const later = "2026-05-04T11:20:00.000Z";

describe("NodeRun lifecycle", () => {
  it("appends a run on mark-running", () => {
    let workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    workflow = transitionTask(workflow, { kind: "mark-ready", taskId: "wf-1:task", now });
    workflow = transitionTask(workflow, {
      kind: "mark-running",
      taskId: "wf-1:task",
      sessionId: "s1",
      now,
    });

    const task = workflow.graph["wf-1:task"]!;
    expect(task.runs).toHaveLength(1);
    expect(task.runs[0]?.attempt).toBe(1);
    expect(task.runs[0]?.runtimeSessionId).toBe("s1");
    expect(task.runs[0]?.endedAt).toBeUndefined();
    expect(task.runs[0]?.id).toBe("run-wf-1:task-1");
  });

  it("closes a run with terminalReason 'completed' on complete-runtime", () => {
    let workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    workflow = transitionTask(workflow, { kind: "mark-ready", taskId: "wf-1:task", now });
    workflow = transitionTask(workflow, {
      kind: "mark-running",
      taskId: "wf-1:task",
      sessionId: "s1",
      now,
    });
    workflow = transitionTask(workflow, { kind: "complete-runtime", taskId: "wf-1:task", now: later });

    const run = workflow.graph["wf-1:task"]!.runs[0]!;
    expect(run.terminalReason).toBe("completed");
    expect(run.endedAt).toBe(later);
  });

  it("closes a run with terminalReason 'cancelled' on cancel-task", () => {
    let workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    workflow = transitionTask(workflow, { kind: "mark-ready", taskId: "wf-1:task", now });
    workflow = transitionTask(workflow, {
      kind: "mark-running",
      taskId: "wf-1:task",
      sessionId: "s1",
      now,
    });
    workflow = transitionTask(workflow, { kind: "cancel-task", taskId: "wf-1:task", now: later });

    const run = workflow.graph["wf-1:task"]!.runs[0]!;
    expect(run.terminalReason).toBe("cancelled");
    expect(run.endedAt).toBe(later);
  });

  it("closes a run with terminalReason 'failed' on fail-task", () => {
    let workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    workflow = transitionTask(workflow, { kind: "mark-ready", taskId: "wf-1:task", now });
    workflow = transitionTask(workflow, {
      kind: "mark-running",
      taskId: "wf-1:task",
      sessionId: "s1",
      now,
    });
    workflow = transitionTask(workflow, { kind: "fail-task", taskId: "wf-1:task", now: later });

    const run = workflow.graph["wf-1:task"]!.runs[0]!;
    expect(run.terminalReason).toBe("failed");
    expect(run.endedAt).toBe(later);
  });

  it("closes a run with terminalReason 'recovered' on recover-task", () => {
    let workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    workflow = transitionTask(workflow, { kind: "mark-ready", taskId: "wf-1:task", now });
    workflow = transitionTask(workflow, {
      kind: "mark-running",
      taskId: "wf-1:task",
      sessionId: "s1",
      now,
    });
    workflow = transitionTask(workflow, { kind: "recover-task", taskId: "wf-1:task", now: later });

    const run = workflow.graph["wf-1:task"]!.runs[0]!;
    expect(run.terminalReason).toBe("recovered");
    expect(run.endedAt).toBe(later);
  });

  it("produces a second run with attempt 2 after recover-task and mark-running", () => {
    let workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    workflow = transitionTask(workflow, { kind: "mark-ready", taskId: "wf-1:task", now });
    workflow = transitionTask(workflow, {
      kind: "mark-running",
      taskId: "wf-1:task",
      sessionId: "s1",
      now,
    });
    workflow = transitionTask(workflow, { kind: "recover-task", taskId: "wf-1:task", now: later });
    workflow = transitionTask(workflow, { kind: "mark-ready", taskId: "wf-1:task", now: later });
    workflow = transitionTask(workflow, {
      kind: "mark-running",
      taskId: "wf-1:task",
      sessionId: "s2",
      now: later,
    });

    const task = workflow.graph["wf-1:task"]!;
    expect(task.runs).toHaveLength(2);
    expect(task.runs[1]?.attempt).toBe(2);
    expect(task.runs[1]?.runtimeSessionId).toBe("s2");
    expect(task.runs[1]?.id).toBe("run-wf-1:task-2");
    expect(task.runs[1]?.endedAt).toBeUndefined();
  });

  it("cancel-task on a pending task leaves runs empty", () => {
    let workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    workflow = transitionTask(workflow, { kind: "cancel-task", taskId: "wf-1:task", now });

    expect(workflow.graph["wf-1:task"]!.runs).toHaveLength(0);
  });

  it("closing a run preserves providerSessionRef and outputOffset", () => {
    let workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    workflow = transitionTask(workflow, { kind: "mark-ready", taskId: "wf-1:task", now });
    workflow = transitionTask(workflow, {
      kind: "mark-running",
      taskId: "wf-1:task",
      sessionId: "s1",
      now,
    });

    const task = workflow.graph["wf-1:task"]!;
    const runWithExtra = {
      ...task.runs[0]!,
      providerSessionRef: "psr-abc",
      outputOffset: 42,
    };
    const wfWithExtra = {
      ...workflow,
      graph: {
        ...workflow.graph,
        "wf-1:task": { ...task, runs: [runWithExtra] },
      },
    };

    const closed = transitionTask(wfWithExtra, { kind: "complete-runtime", taskId: "wf-1:task", now: later });
    const closedRun = closed.graph["wf-1:task"]!.runs[0]!;
    expect(closedRun.providerSessionRef).toBe("psr-abc");
    expect(closedRun.outputOffset).toBe(42);
    expect(closedRun.terminalReason).toBe("completed");
  });
});
