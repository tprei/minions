import { describe, expect, it, vi } from "vitest";
import { InMemoryWorkflowRepository } from "../../src/application/repository.js";
import { NoopRestackExecutor } from "../../src/application/restack-executor.js";
import { createRecoveryService } from "../../src/application/recovery-service.js";
import { silentLogger } from "../test-helpers.js";
import { StubRuntimeBackend } from "../../src/plugins/stub-runtime.js";
import { StubWorkspaceBackend } from "../../src/plugins/workspace/stub-workspace.js";
import { createServer } from "../../src/transport/server.js";
import { createSingleTaskWorkflow } from "../../src/domain/workflow.js";
import { DomainError } from "../../src/domain/errors.js";
import { DraftPrError } from "../../src/application/draft-pr-service.js";
import type { DraftPrServiceDeps } from "../../src/application/draft-pr-service.js";
import type { Artifact } from "../../src/domain/types.js";
import { applyCommand } from "../../src/application/commands.js";

const now = "2026-05-08T10:00:00.000Z";

function makeApp(draftPrDeps?: DraftPrServiceDeps) {
  const repo = new InMemoryWorkflowRepository();
  const executor = new NoopRestackExecutor();
  const runtime = new StubRuntimeBackend();
  const recoveryService = createRecoveryService(repo, executor, runtime, () => now, silentLogger());
  const app = createServer({ repo, recoveryService, executor, ...(draftPrDeps !== undefined ? { draftPrDeps } : {}) });
  return { app, repo };
}

async function seedWorkflowWithBranch(repo: InMemoryWorkflowRepository): Promise<void> {
  const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
  await repo.save(wf, []);

  await applyCommand(repo, {
    kind: "transition-task",
    workflowId: "wf-1",
    transition: { kind: "mark-ready", taskId: "wf-1:task", now },
  });

  const current = await repo.get("wf-1");
  const task = current!.graph["wf-1:task"]!;
  const branchArtifact: Artifact = {
    kind: "branch",
    ref: "minions/wf-1_task",
    producedBy: "wf-1:task",
    createdAt: now,
  };
  const patched = {
    ...current!,
    version: current!.version + 1,
    graph: {
      "wf-1:task": {
        ...task,
        artifacts: [...task.artifacts, branchArtifact],
      },
    },
  };
  await repo.save(patched, []);
}

describe("POST /workflows/:id/tasks/:taskId/draft-pr", () => {
  it("returns 503 when draftPrDeps is not configured", async () => {
    const { app, repo } = makeApp();
    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(wf, []);

    const res = await app.request("/workflows/wf-1/tasks/wf-1:task/draft-pr", { method: "POST" });
    expect(res.status).toBe(503);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("internal_error");
  });

  it("returns 200 with title and body on success", async () => {
    const { repo } = makeApp();
    await seedWorkflowWithBranch(repo);

    const mockDraftPrDeps: DraftPrServiceDeps = {
      repo,
      providerFactory: vi.fn(),
      runtime: new StubRuntimeBackend(),
      workspace: new StubWorkspaceBackend(),
    };

    vi.spyOn(mockDraftPrDeps, "providerFactory");

    const draftPrModule = await import("../../src/application/draft-pr-service.js");
    const draftPrSpy = vi.spyOn(draftPrModule, "draftPr").mockResolvedValue({
      title: "Add feature X",
      body: "This PR adds feature X",
    });

    const app = createServer({
      repo,
      recoveryService: createRecoveryService(
        repo,
        new NoopRestackExecutor(),
        new StubRuntimeBackend(),
        () => now,
        silentLogger(),
      ),
      executor: new NoopRestackExecutor(),
      draftPrDeps: mockDraftPrDeps,
    });

    const res = await app.request("/workflows/wf-1/tasks/wf-1:task/draft-pr", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json() as { title: string; body: string };
    expect(body.title).toBe("Add feature X");
    expect(body.body).toBe("This PR adds feature X");

    draftPrSpy.mockRestore();
  });

  it("returns 404 when workflow not found", async () => {
    const repo = new InMemoryWorkflowRepository();
    const mockDraftPrDeps: DraftPrServiceDeps = {
      repo,
      providerFactory: vi.fn(),
      runtime: new StubRuntimeBackend(),
      workspace: new StubWorkspaceBackend(),
    };

    const draftPrModule = await import("../../src/application/draft-pr-service.js");
    const draftPrSpy = vi.spyOn(draftPrModule, "draftPr").mockRejectedValue(
      new DomainError("not_found", "workflow not found", { workflowId: "no-wf" }),
    );

    const app = createServer({
      repo,
      recoveryService: createRecoveryService(
        repo,
        new NoopRestackExecutor(),
        new StubRuntimeBackend(),
        () => now,
        silentLogger(),
      ),
      executor: new NoopRestackExecutor(),
      draftPrDeps: mockDraftPrDeps,
    });

    const res = await app.request("/workflows/no-wf/tasks/no-wf:task/draft-pr", { method: "POST" });
    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("not_found");

    draftPrSpy.mockRestore();
  });

  it("returns 422 when task has no branch artifact", async () => {
    const repo = new InMemoryWorkflowRepository();
    const mockDraftPrDeps: DraftPrServiceDeps = {
      repo,
      providerFactory: vi.fn(),
      runtime: new StubRuntimeBackend(),
      workspace: new StubWorkspaceBackend(),
    };

    const draftPrModule = await import("../../src/application/draft-pr-service.js");
    const draftPrSpy = vi.spyOn(draftPrModule, "draftPr").mockRejectedValue(
      new DomainError("invalid_transition", "task has no branch artifact", { taskId: "wf-1:task" }),
    );

    const app = createServer({
      repo,
      recoveryService: createRecoveryService(
        repo,
        new NoopRestackExecutor(),
        new StubRuntimeBackend(),
        () => now,
        silentLogger(),
      ),
      executor: new NoopRestackExecutor(),
      draftPrDeps: mockDraftPrDeps,
    });

    const res = await app.request("/workflows/wf-1/tasks/wf-1:task/draft-pr", { method: "POST" });
    expect(res.status).toBe(422);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("invalid_transition");

    draftPrSpy.mockRestore();
  });

  it("returns 504 on timeout", async () => {
    const repo = new InMemoryWorkflowRepository();
    const mockDraftPrDeps: DraftPrServiceDeps = {
      repo,
      providerFactory: vi.fn(),
      runtime: new StubRuntimeBackend(),
      workspace: new StubWorkspaceBackend(),
    };

    const draftPrModule = await import("../../src/application/draft-pr-service.js");
    const draftPrSpy = vi.spyOn(draftPrModule, "draftPr").mockRejectedValue(
      new DraftPrError("timeout", "draft-pr timed out after 30s"),
    );

    const app = createServer({
      repo,
      recoveryService: createRecoveryService(
        repo,
        new NoopRestackExecutor(),
        new StubRuntimeBackend(),
        () => now,
        silentLogger(),
      ),
      executor: new NoopRestackExecutor(),
      draftPrDeps: mockDraftPrDeps,
    });

    const res = await app.request("/workflows/wf-1/tasks/wf-1:task/draft-pr", { method: "POST" });
    expect(res.status).toBe(504);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("draft_pr_timeout");

    draftPrSpy.mockRestore();
  });

  it("returns 500 on parse error", async () => {
    const repo = new InMemoryWorkflowRepository();
    const mockDraftPrDeps: DraftPrServiceDeps = {
      repo,
      providerFactory: vi.fn(),
      runtime: new StubRuntimeBackend(),
      workspace: new StubWorkspaceBackend(),
    };

    const draftPrModule = await import("../../src/application/draft-pr-service.js");
    const draftPrSpy = vi.spyOn(draftPrModule, "draftPr").mockRejectedValue(
      new DraftPrError("parse_error", "provider response is not valid JSON: not-json"),
    );

    const app = createServer({
      repo,
      recoveryService: createRecoveryService(
        repo,
        new NoopRestackExecutor(),
        new StubRuntimeBackend(),
        () => now,
        silentLogger(),
      ),
      executor: new NoopRestackExecutor(),
      draftPrDeps: mockDraftPrDeps,
    });

    const res = await app.request("/workflows/wf-1/tasks/wf-1:task/draft-pr", { method: "POST" });
    expect(res.status).toBe(500);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("draft_pr_parse_error");

    draftPrSpy.mockRestore();
  });
});
