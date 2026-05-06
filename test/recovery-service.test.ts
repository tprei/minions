import { describe, expect, it } from "vitest";
import { applyCommand } from "../src/application/commands.js";
import { createRecoveryService } from "../src/application/recovery-service.js";
import { NoopRestackExecutor } from "../src/application/restack-executor.js";
import { InMemoryWorkflowRepository } from "../src/application/repository.js";
import { StubRuntimeBackend } from "../src/plugins/stub-runtime.js";
import { createSingleTaskWorkflow } from "../src/domain/workflow.js";

const started = "2026-05-04T11:19:00.000Z";
const nowMs = new Date("2026-05-04T11:21:00.000Z").getTime();

const defaultOptions = {
  nowMs,
  staleReadyMs: 60_000,
  staleGateMs: 300_000,
};

async function seedReady() {
  const repo = new InMemoryWorkflowRepository();
  const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => started);
  await repo.save(workflow, []);
  await applyCommand(repo, {
    kind: "transition-task",
    workflowId: "wf-1",
    transition: { kind: "mark-ready", taskId: "wf-1:task", now: started },
  });
  return repo;
}

describe("RecoveryService.scan", () => {
  it("recovers a stale-ready task back to pending", async () => {
    const repo = await seedReady();
    const service = createRecoveryService(repo, new NoopRestackExecutor(), new StubRuntimeBackend(), () => started);

    const results = await service.scan("wf-1", defaultOptions);

    expect(results).toHaveLength(1);
    const saved = await repo.get("wf-1");
    expect(saved?.graph["wf-1:task"]?.executionStatus).toBe("pending");
  });

  it("resumes a pending restack operation to completed via NoopRestackExecutor", async () => {
    const repo = new InMemoryWorkflowRepository();
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => started);
    await repo.save(workflow, []);

    await applyCommand(repo, {
      kind: "request-restack",
      workflowId: "wf-1",
      input: {
        operationId: "op-1",
        ancestorId: "wf-1:task",
        idempotencyKey: "k1",
        now: started,
      },
    });

    const service = createRecoveryService(repo, new NoopRestackExecutor(), new StubRuntimeBackend(), () => started);
    const results = await service.scan("wf-1", defaultOptions);

    expect(results.length).toBeGreaterThanOrEqual(1);
    const saved = await repo.get("wf-1");
    expect(saved?.operations["op-1"]?.status).toBe("completed");
  });

  it("second scan produces zero new events for the same conditions", async () => {
    const repo = await seedReady();
    const service = createRecoveryService(repo, new NoopRestackExecutor(), new StubRuntimeBackend(), () => started);

    await service.scan("wf-1", defaultOptions);

    const beforeCursor = (await repo.eventsSince("wf-1", 0)).length;
    const secondResults = await service.scan("wf-1", defaultOptions);
    const afterCursor = (await repo.eventsSince("wf-1", 0)).length;

    expect(secondResults).toHaveLength(0);
    expect(afterCursor).toBe(beforeCursor);
  });

  it("throws not_found for unknown workflow", async () => {
    const repo = new InMemoryWorkflowRepository();
    const service = createRecoveryService(repo, new NoopRestackExecutor(), new StubRuntimeBackend(), () => started);

    await expect(service.scan("missing", defaultOptions)).rejects.toMatchObject({ code: "not_found" });
  });

  it("records an idempotency key after recovering a stale-ready task", async () => {
    const repo = await seedReady();
    const service = createRecoveryService(repo, new NoopRestackExecutor(), new StubRuntimeBackend(), () => started);

    await service.scan("wf-1", defaultOptions);

    const key = `recovery:wf-1:wf-1:task:recover-task:0`;
    const ref = await repo.lookupIdempotency("wf-1", key);
    expect(ref).toBe("recovery:recover-task:wf-1:task");
  });

  it("skips dispatch when the idempotency key is pre-recorded", async () => {
    const repo = await seedReady();
    const key = `recovery:wf-1:wf-1:task:recover-task:0`;
    // Seed the idempotency row via save() — recordIdempotency is removed from the interface
    const wf = await repo.get("wf-1");
    await repo.save({ ...wf!, version: wf!.version + 1 }, [], [{ key, resultRef: "recovery:recover-task:wf-1:task" }]);

    const service = createRecoveryService(repo, new NoopRestackExecutor(), new StubRuntimeBackend(), () => started);
    const results = await service.scan("wf-1", defaultOptions);

    expect(results).toHaveLength(0);
    const saved = await repo.get("wf-1");
    expect(saved?.graph["wf-1:task"]?.executionStatus).toBe("ready");
  });
});
