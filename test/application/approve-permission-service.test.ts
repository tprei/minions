import { describe, expect, it } from "vitest";
import { ApprovePermissionService } from "../../src/application/approve-permission-service.js";
import { applyCommand } from "../../src/application/commands.js";
import { InMemoryWorkflowRepository } from "../../src/application/repository.js";
import { DomainError } from "../../src/domain/errors.js";
import { createSingleTaskWorkflow } from "../../src/domain/workflow.js";
import { StubProviderPlugin } from "../../src/plugins/providers/stub.js";
import type { ProviderPlugin } from "../../src/plugins/provider-plugin.js";

function makeActiveProviders(entries: Array<[workflowId: string, taskId: string, provider: ProviderPlugin]>): Map<string, Map<string, ProviderPlugin>> {
  const map = new Map<string, Map<string, ProviderPlugin>>();
  for (const [workflowId, taskId, provider] of entries) {
    if (!map.has(workflowId)) map.set(workflowId, new Map());
    map.get(workflowId)!.set(taskId, provider);
  }
  return map;
}

const now = "2026-05-08T12:00:00.000Z";

async function makeRunningTask(repo: InMemoryWorkflowRepository): Promise<void> {
  const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
  await repo.save(wf, []);
  await applyCommand(repo, {
    kind: "transition-task",
    workflowId: "wf-1",
    transition: { kind: "mark-ready", taskId: "wf-1:task", now },
  });
  await applyCommand(repo, {
    kind: "transition-task",
    workflowId: "wf-1",
    transition: { kind: "mark-running", taskId: "wf-1:task", sessionId: "s1", now },
  });
}

describe("ApprovePermissionService", () => {
  it("routes approve to stub provider and records the call", async () => {
    const repo = new InMemoryWorkflowRepository();
    await makeRunningTask(repo);

    const provider = new StubProviderPlugin({ frames: [] });
    const activeProviders = makeActiveProviders([["wf-1", "wf-1:task", provider]]);
    const service = new ApprovePermissionService({ repo, activeProviders });

    const result = await service.run({
      workflowId: "wf-1",
      taskId: "wf-1:task",
      requestId: "req-123",
      decision: "approve",
    });

    expect(result.ok).toBe(true);
    expect(provider.approvalCalls).toHaveLength(1);
    expect(provider.approvalCalls[0]).toMatchObject({
      requestId: "req-123",
      decision: "approve",
    });
    expect(provider.approvalCalls[0]).not.toHaveProperty("reason");
  });

  it("routes deny with reason to stub provider", async () => {
    const repo = new InMemoryWorkflowRepository();
    await makeRunningTask(repo);

    const provider = new StubProviderPlugin({ frames: [] });
    const activeProviders = makeActiveProviders([["wf-1", "wf-1:task", provider]]);
    const service = new ApprovePermissionService({ repo, activeProviders });

    const result = await service.run({
      workflowId: "wf-1",
      taskId: "wf-1:task",
      requestId: "req-456",
      decision: "deny",
      reason: "not permitted",
    });

    expect(result.ok).toBe(true);
    expect(provider.approvalCalls[0]).toMatchObject({
      requestId: "req-456",
      decision: "deny",
      reason: "not permitted",
    });
  });

  it("returns error when no active session for task", async () => {
    const repo = new InMemoryWorkflowRepository();
    await makeRunningTask(repo);

    const activeProviders = new Map<string, Map<string, ProviderPlugin>>();
    const service = new ApprovePermissionService({ repo, activeProviders });

    let caughtErr: unknown;
    try {
      await service.run({
        workflowId: "wf-1",
        taskId: "wf-1:task",
        requestId: "req-789",
        decision: "approve",
      });
    } catch (e) {
      caughtErr = e;
    }
    expect(caughtErr).toBeInstanceOf(DomainError);
    expect((caughtErr as DomainError).code).toBe("not_found");
    expect((caughtErr as DomainError).message).toContain("no active provider session");
  });

  it("returns error when provider does not implement injectApproval", async () => {
    const repo = new InMemoryWorkflowRepository();
    await makeRunningTask(repo);

    const provider: ProviderPlugin = {
      name: "no-inject",
      capabilities: {
        resume: false,
        mcp: false,
        structuredOutput: false,
        oauthLogin: false,
        streamJson: false,
        sessionRefFormat: "opaque",
      },
      async prepare() { return { command: ["echo"], providerType: "no-inject" }; },
      async resume() { return { command: ["echo"], providerType: "no-inject" }; },
      parseFrame() { return []; },
      async loginStatus() { return { loggedIn: true }; },
    };

    const activeProviders = makeActiveProviders([["wf-1", "wf-1:task", provider]]);
    const service = new ApprovePermissionService({ repo, activeProviders });

    let caughtErr: unknown;
    try {
      await service.run({
        workflowId: "wf-1",
        taskId: "wf-1:task",
        requestId: "req-000",
        decision: "approve",
      });
    } catch (e) {
      caughtErr = e;
    }
    expect(caughtErr).toBeInstanceOf(DomainError);
    expect((caughtErr as DomainError).code).toBe("invalid_transition");
    expect((caughtErr as DomainError).message).toContain("does not support approval injection");
  });

  it("returns not_found when workflow does not exist", async () => {
    const repo = new InMemoryWorkflowRepository();
    const activeProviders = new Map<string, Map<string, ProviderPlugin>>();
    const service = new ApprovePermissionService({ repo, activeProviders });

    let caughtErr: unknown;
    try {
      await service.run({
        workflowId: "nonexistent",
        taskId: "task-1",
        requestId: "req-000",
        decision: "approve",
      });
    } catch (e) {
      caughtErr = e;
    }
    expect(caughtErr).toBeInstanceOf(DomainError);
    expect((caughtErr as DomainError).code).toBe("not_found");
    expect((caughtErr as DomainError).message).toContain("workflow not found");
  });

  it("returns not_found when task does not exist", async () => {
    const repo = new InMemoryWorkflowRepository();
    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(wf, []);

    const activeProviders = new Map<string, Map<string, ProviderPlugin>>();
    const service = new ApprovePermissionService({ repo, activeProviders });

    let caughtErr: unknown;
    try {
      await service.run({
        workflowId: "wf-1",
        taskId: "nonexistent-task",
        requestId: "req-000",
        decision: "approve",
      });
    } catch (e) {
      caughtErr = e;
    }
    expect(caughtErr).toBeInstanceOf(DomainError);
    expect((caughtErr as DomainError).code).toBe("not_found");
    expect((caughtErr as DomainError).message).toContain("task not found");
  });

  it("returns invalid_transition when task is not running", async () => {
    const repo = new InMemoryWorkflowRepository();
    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(wf, []);

    const provider = new StubProviderPlugin({ frames: [] });
    const activeProviders = makeActiveProviders([["wf-1", "wf-1:task", provider]]);
    const service = new ApprovePermissionService({ repo, activeProviders });

    let caughtErr: unknown;
    try {
      await service.run({
        workflowId: "wf-1",
        taskId: "wf-1:task",
        requestId: "req-000",
        decision: "approve",
      });
    } catch (e) {
      caughtErr = e;
    }
    expect(caughtErr).toBeInstanceOf(DomainError);
    expect((caughtErr as DomainError).code).toBe("invalid_transition");
    expect((caughtErr as DomainError).message).toContain("running");
  });

  it("routes to correct provider when workflowId and taskId contain colons that would collide as flat keys", async () => {
    const repo = new InMemoryWorkflowRepository();

    // workflow "a:b" with task "c" — old flat key would be "a:b:c"
    const wfAB = createSingleTaskWorkflow("a:b", { id: "c", title: "T", prompt: "P" }, () => now);
    await repo.save(wfAB, []);
    await applyCommand(repo, {
      kind: "transition-task",
      workflowId: "a:b",
      transition: { kind: "mark-ready", taskId: "c", now },
    });
    await applyCommand(repo, {
      kind: "transition-task",
      workflowId: "a:b",
      transition: { kind: "mark-running", taskId: "c", sessionId: "s-ab", now },
    });

    // workflow "a" with task "b:c" — old flat key would also be "a:b:c"
    const wfA = createSingleTaskWorkflow("a", { id: "b:c", title: "T", prompt: "P" }, () => now);
    await repo.save(wfA, []);
    await applyCommand(repo, {
      kind: "transition-task",
      workflowId: "a",
      transition: { kind: "mark-ready", taskId: "b:c", now },
    });
    await applyCommand(repo, {
      kind: "transition-task",
      workflowId: "a",
      transition: { kind: "mark-running", taskId: "b:c", sessionId: "s-a", now },
    });

    const providerAB = new StubProviderPlugin({ frames: [] });
    const providerA = new StubProviderPlugin({ frames: [] });
    const activeProviders = makeActiveProviders([
      ["a:b", "c", providerAB],
      ["a", "b:c", providerA],
    ]);
    const service = new ApprovePermissionService({ repo, activeProviders });

    await service.run({ workflowId: "a:b", taskId: "c", requestId: "req-ab", decision: "approve" });

    expect(providerAB.approvalCalls).toHaveLength(1);
    expect(providerAB.approvalCalls[0]).toMatchObject({ requestId: "req-ab", decision: "approve" });
    expect(providerA.approvalCalls).toHaveLength(0);
  });
});
