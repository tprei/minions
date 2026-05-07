import { describe, expect, it, vi } from "vitest";
import { InMemoryWorkflowRepository } from "../../src/application/repository.js";
import { NoopRestackExecutor } from "../../src/application/restack-executor.js";
import { createRecoveryService } from "../../src/application/recovery-service.js";
import { StubRuntimeBackend } from "../../src/plugins/stub-runtime.js";
import { createServer } from "../../src/transport/server.js";
import { createSingleTaskWorkflow } from "../../src/domain/workflow.js";
import type { MergeService } from "../../src/application/merge-service.js";

const now = "2026-05-06T10:00:00.000Z";

function makeApp(mergeService?: MergeService) {
  const repo = new InMemoryWorkflowRepository();
  const executor = new NoopRestackExecutor();
  const runtime = new StubRuntimeBackend();
  const recoveryService = createRecoveryService(repo, executor, runtime, () => now);
  const deps = { repo, recoveryService, executor };
  if (mergeService !== undefined) {
    (deps as typeof deps & { mergeService: MergeService }).mergeService = mergeService;
  }
  const app = createServer(deps);
  return { app, repo };
}

describe("POST /workflows/:id/tasks/:taskId/merge", () => {
  it("returns 503 when mergeService is not configured", async () => {
    const { app, repo } = makeApp();
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, []);

    const res = await app.request("/workflows/wf-1/tasks/wf-1:task/merge", { method: "POST" });
    expect(res.status).toBe(503);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("internal_error");
  });

  it("calls mergeService.merge with workflowId and taskId", async () => {
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    const mockResult = { workflow, events: [] };
    const mockMergeService = {
      merge: vi.fn().mockResolvedValue(mockResult),
    } as unknown as MergeService;

    const { app } = makeApp(mockMergeService);

    const res = await app.request("/workflows/wf-1/tasks/wf-1:task/merge", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mockMergeService.merge).toHaveBeenCalledWith({ workflowId: "wf-1", taskId: "wf-1:task" });
  });

  it("propagates DomainError as HTTP error response", async () => {
    const { DomainError } = await import("../../src/domain/errors.js");
    const mockMergeService = {
      merge: vi.fn().mockRejectedValue(new DomainError("not_found", "workflow not found", {})),
    } as unknown as MergeService;

    const { app } = makeApp(mockMergeService);

    const res = await app.request("/workflows/wf-1/tasks/wf-1:task/merge", { method: "POST" });
    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("not_found");
  });
});
