import { describe, expect, it } from "vitest";
import { ApprovePermissionService } from "../../src/application/approve-permission-service.js";
import { applyCommand } from "../../src/application/commands.js";
import { InMemoryWorkflowRepository } from "../../src/application/repository.js";
import { DomainError } from "../../src/domain/errors.js";
import { createSingleTaskWorkflow } from "../../src/domain/workflow.js";
import { StubProviderPlugin } from "../../src/plugins/providers/stub.js";
import type { ProviderPlugin } from "../../src/plugins/provider-plugin.js";

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
    const activeProviders = new Map<string, ProviderPlugin>([["wf-1:wf-1:task", provider]]);
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
    const activeProviders = new Map<string, ProviderPlugin>([["wf-1:wf-1:task", provider]]);
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

    const activeProviders = new Map<string, ProviderPlugin>();
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

    const activeProviders = new Map<string, ProviderPlugin>([["wf-1:wf-1:task", provider]]);
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
    const activeProviders = new Map<string, ProviderPlugin>();
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

    const activeProviders = new Map<string, ProviderPlugin>();
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
    const activeProviders = new Map<string, ProviderPlugin>([["wf-1:wf-1:task", provider]]);
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
});
