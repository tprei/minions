import { describe, expect, it } from "vitest";
import { StubWorkspaceBackend } from "../../../src/plugins/workspace/stub-workspace.js";

describe("StubWorkspaceBackend", () => {
  it("returns deterministic handle for given workflowId and taskId", async () => {
    const backend = new StubWorkspaceBackend();
    const handle = await backend.create({
      workflowId: "wf-1",
      taskId: "task-1",
      branch: "minions/wf1_task1",
    });

    expect(handle.workspaceId).toBe("stub-wf-1-b3dcb3_task-1-7afaa3");
    expect(handle.path).toBe("/stub-workspace");
    expect(handle.containerPath).toBe("/stub-workspace");
    expect(handle.mode).toBe("existing");
    expect(handle.branch).toBe("minions/wf1_task1");
  });

  it("creates are idempotent (same id for same inputs)", async () => {
    const backend = new StubWorkspaceBackend();
    const h1 = await backend.create({ workflowId: "wf-1", taskId: "t-1", branch: "b" });
    const h2 = await backend.create({ workflowId: "wf-1", taskId: "t-1", branch: "b" });

    expect(h1.workspaceId).toBe(h2.workspaceId);
  });

  it("cleanup is a no-op and resolves", async () => {
    const backend = new StubWorkspaceBackend();
    await expect(backend.cleanup("any-id")).resolves.toBeUndefined();
    await expect(backend.cleanup("nonexistent")).resolves.toBeUndefined();
  });
});
