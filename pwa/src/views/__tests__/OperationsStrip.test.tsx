import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { Workflow } from "../../domain/types";

vi.mock("../../transport/rest", () => ({
  postCommand: vi.fn().mockResolvedValue(undefined),
}));

import { OperationsStrip } from "../OperationsStrip";

function makeWorkflow(ops: Workflow["operations"]): Workflow {
  return {
    id: "wf-1",
    kind: "single-task",
    status: "active",
    graph: {},
    operations: ops,
    policy: { maxConcurrent: 1, autoLand: false, autoMergeOnGreen: false },
    version: 1,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  };
}

describe("OperationsStrip", () => {
  afterEach(cleanup);

  it("renders nothing when no in-flight operations", () => {
    const { container } = render(
      <OperationsStrip
        workflow={makeWorkflow({
          "op-1": {
            id: "op-1", workflowId: "wf-1", kind: "restack", targetNodeId: "t1",
            affectedNodeIds: [], status: "completed", attempt: 1, idempotencyKey: "k1",
            createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
          },
        })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders op cards for pending operations", () => {
    const { container } = render(
      <OperationsStrip
        workflow={makeWorkflow({
          "op-1": {
            id: "op-1", workflowId: "wf-1", kind: "restack", targetNodeId: "t1",
            affectedNodeIds: ["t2"], status: "pending", attempt: 1, idempotencyKey: "k1",
            createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
          },
        })}
      />,
    );
    expect(container.firstChild).not.toBeNull();
    expect(container.textContent).toContain("Restack pending");
    expect(container.textContent).toContain("t2");
  });

  it("renders op cards for running operations", () => {
    const { container } = render(
      <OperationsStrip
        workflow={makeWorkflow({
          "op-2": {
            id: "op-2", workflowId: "wf-1", kind: "restack", targetNodeId: "t1",
            affectedNodeIds: [], status: "running", attempt: 1, idempotencyKey: "k2",
            createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
          },
        })}
      />,
    );
    expect(container.textContent).toContain("Restack pending");
  });
});
