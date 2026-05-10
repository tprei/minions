import { describe, it, expect, beforeEach } from "vitest";
import { useWorkflowStore } from "../useWorkflowStore";
import type { Workflow, WorkflowEvent, TaskNode, GraphOperation } from "../../domain/types";

function makeTask(id: string, partial: Partial<TaskNode> = {}): TaskNode {
  return {
    id,
    workflowId: "wf1",
    title: "t",
    prompt: "p",
    dependsOn: [],
    executionStatus: "pending",
    stackStatus: "clean",
    priority: 0,
    claims: [],
    contract: { summary: "", expectedArtifacts: [] },
    artifacts: [],
    runs: [],
    readiness: "unknown",
    version: 1,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...partial,
  };
}

function makeOp(id: string, partial: Partial<GraphOperation> = {}): GraphOperation {
  return {
    id,
    workflowId: "wf1",
    kind: "restack",
    targetNodeId: "t1",
    affectedNodeIds: [],
    status: "pending",
    attempt: 0,
    idempotencyKey: "key1",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...partial,
  };
}

function makeWorkflow(partial: Partial<Workflow> = {}): Workflow {
  return {
    id: "wf1",
    kind: "single-task",
    status: "active",
    graph: { t1: makeTask("t1") },
    operations: { op1: makeOp("op1") },
    policy: { maxConcurrent: 1, autoLand: false, autoMergeOnGreen: false },
    version: 1,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...partial,
  };
}

function baseEvt(kind: WorkflowEvent["kind"]): Omit<WorkflowEvent, "kind" | "payload"> {
  return { cursor: 2, workflowId: "wf1", occurredAt: "2025-01-02T00:00:00Z" };
}

describe("useWorkflowStore.applyEvent", () => {
  beforeEach(() => {
    useWorkflowStore.setState({ workflows: new Map(), summaries: undefined });
    const wf = makeWorkflow();
    useWorkflowStore.getState().setWorkflow(wf);
  });

  it("workflow-status-changed patches workflow status", () => {
    const evt: WorkflowEvent = {
      ...baseEvt("workflow-status-changed"),
      kind: "workflow-status-changed",
      payload: { fromStatus: "active", toStatus: "completed" },
    };
    useWorkflowStore.getState().applyEvent(evt);
    expect(useWorkflowStore.getState().workflows.get("wf1")?.status).toBe("completed");
  });

  it("task-transitioned patches task execution and stack status and version", () => {
    const evt: WorkflowEvent = {
      ...baseEvt("task-transitioned"),
      kind: "task-transitioned",
      payload: {
        taskId: "t1",
        fromExecutionStatus: "pending",
        toExecutionStatus: "running",
        fromStackStatus: "clean",
        toStackStatus: "restack-pending",
        taskVersion: 5,
      },
    };
    useWorkflowStore.getState().applyEvent(evt);
    const task = useWorkflowStore.getState().workflows.get("wf1")?.graph["t1"];
    expect(task?.executionStatus).toBe("running");
    expect(task?.stackStatus).toBe("restack-pending");
    expect(task?.version).toBe(5);
  });

  it("graph-operation-changed patches operation status", () => {
    const evt: WorkflowEvent = {
      ...baseEvt("graph-operation-changed"),
      kind: "graph-operation-changed",
      payload: { operationId: "op1", kind: "restack", fromStatus: "pending", toStatus: "running" },
    };
    useWorkflowStore.getState().applyEvent(evt);
    expect(useWorkflowStore.getState().workflows.get("wf1")?.operations["op1"]?.status).toBe("running");
  });

  it("run-started appends a new run to the task", () => {
    const evt: WorkflowEvent = {
      ...baseEvt("run-started"),
      kind: "run-started",
      payload: {
        runId: "run1",
        taskId: "t1",
        attempt: 0,
        runtimeSessionId: "sess1",
        providerType: "claude",
        runtimeType: "local",
      },
    };
    useWorkflowStore.getState().applyEvent(evt);
    const runs = useWorkflowStore.getState().workflows.get("wf1")?.graph["t1"]?.runs;
    expect(runs).toHaveLength(1);
    expect(runs?.[0]?.id).toBe("run1");
  });

  it("run-ended patches endedAt and terminalReason on the matching run", () => {
    const wf = makeWorkflow({
      graph: {
        t1: makeTask("t1", {
          runs: [
            {
              id: "run1",
              taskId: "t1",
              attempt: 0,
              providerType: "claude",
              runtimeType: "local",
              runtimeSessionId: "sess1",
              startedAt: "2025-01-01T00:00:00Z",
            },
          ],
        }),
      },
    });
    useWorkflowStore.getState().setWorkflow(wf);

    const evt: WorkflowEvent = {
      ...baseEvt("run-ended"),
      kind: "run-ended",
      payload: { runId: "run1", taskId: "t1", attempt: 0, terminalReason: "completed" },
    };
    useWorkflowStore.getState().applyEvent(evt);
    const run = useWorkflowStore.getState().workflows.get("wf1")?.graph["t1"]?.runs[0];
    expect(run?.terminalReason).toBe("completed");
    expect(run?.endedAt).toBe("2025-01-02T00:00:00Z");
  });

  it("provider-event does not mutate workflow state", () => {
    const before = useWorkflowStore.getState().workflows.get("wf1");
    const evt: WorkflowEvent = {
      ...baseEvt("provider-event"),
      kind: "provider-event",
      payload: { taskId: "t1", runId: "run1", providerEvent: {} },
    };
    useWorkflowStore.getState().applyEvent(evt);
    expect(useWorkflowStore.getState().workflows.get("wf1")).toBe(before);
  });

  it("merge-phase does not mutate workflow state", () => {
    const before = useWorkflowStore.getState().workflows.get("wf1");
    const evt: WorkflowEvent = {
      ...baseEvt("merge-phase"),
      kind: "merge-phase",
      payload: { taskId: "t1", phase: "commit", status: "started" },
    };
    useWorkflowStore.getState().applyEvent(evt);
    expect(useWorkflowStore.getState().workflows.get("wf1")).toBe(before);
  });
});
