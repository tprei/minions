import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../transport/rest", () => ({
  postCommand: vi.fn().mockResolvedValue(undefined),
}));

import { postCommand } from "../../transport/rest";

describe("approval flow", () => {
  beforeEach(() => {
    vi.mocked(postCommand).mockClear();
  });

  it("emits the correct approve-permission command on approve", async () => {
    await postCommand({
      kind: "approve-permission",
      workflowId: "wf-1",
      taskId: "t-1",
      requestId: "req-1",
      decision: "approve",
    });

    expect(vi.mocked(postCommand)).toHaveBeenCalledWith({
      kind: "approve-permission",
      workflowId: "wf-1",
      taskId: "t-1",
      requestId: "req-1",
      decision: "approve",
    });
  });

  it("emits the correct approve-permission command on deny with reason", async () => {
    await postCommand({
      kind: "approve-permission",
      workflowId: "wf-1",
      taskId: "t-1",
      requestId: "req-1",
      decision: "deny",
      reason: "not safe",
    });

    expect(vi.mocked(postCommand)).toHaveBeenCalledWith({
      kind: "approve-permission",
      workflowId: "wf-1",
      taskId: "t-1",
      requestId: "req-1",
      decision: "deny",
      reason: "not safe",
    });
  });
});
