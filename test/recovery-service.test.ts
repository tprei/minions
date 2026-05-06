import { describe, expect, it } from "vitest";
import { applyCommand } from "../src/application/commands.js";
import { createRecoveryService } from "../src/application/recovery-service.js";
import { NoopRestackExecutor } from "../src/application/restack-executor.js";
import { InMemoryWorkflowRepository } from "../src/application/repository.js";
import type { WorkflowRepository } from "../src/application/repository.js";
import type { RuntimeProbeState } from "../src/application/recovery.js";
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

  it("scan with missing probe ends task in needs-review with interrupted run", async () => {
    const repo = new InMemoryWorkflowRepository();
    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => started);
    await repo.save(wf, []);
    await applyCommand(repo, {
      kind: "transition-task",
      workflowId: "wf-1",
      transition: { kind: "mark-ready", taskId: "wf-1:task", now: started },
    });
    await applyCommand(repo, {
      kind: "transition-task",
      workflowId: "wf-1",
      transition: { kind: "mark-running", taskId: "wf-1:task", sessionId: "s-missing", now: started },
    });

    const service = createRecoveryService(repo, new NoopRestackExecutor(), new StubRuntimeBackend(), () => started);
    const results = await service.scan("wf-1", {
      ...defaultOptions,
      runtimeProbes: { "s-missing": "missing" as RuntimeProbeState },
    });

    expect(results).toHaveLength(1);
    const saved = await repo.get("wf-1");
    const task = saved?.graph["wf-1:task"];
    expect(task?.executionStatus).toBe("needs-review");
    expect(task?.sessionId).toBeUndefined();
    const lastRun = task?.runs[task.runs.length - 1];
    expect(lastRun?.terminalReason).toBe("interrupted");
  });

  it("second scan with missing probe produces no new results (idempotency)", async () => {
    const repo = new InMemoryWorkflowRepository();
    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => started);
    await repo.save(wf, []);
    await applyCommand(repo, {
      kind: "transition-task",
      workflowId: "wf-1",
      transition: { kind: "mark-ready", taskId: "wf-1:task", now: started },
    });
    await applyCommand(repo, {
      kind: "transition-task",
      workflowId: "wf-1",
      transition: { kind: "mark-running", taskId: "wf-1:task", sessionId: "s-missing", now: started },
    });

    const service = createRecoveryService(repo, new NoopRestackExecutor(), new StubRuntimeBackend(), () => started);
    const options = { ...defaultOptions, runtimeProbes: { "s-missing": "missing" as RuntimeProbeState } };
    await service.scan("wf-1", options);

    const beforeCursor = (await repo.eventsSince("wf-1", 0)).length;
    const secondResults = await service.scan("wf-1", options);
    const afterCursor = (await repo.eventsSince("wf-1", 0)).length;

    expect(secondResults).toHaveLength(0);
    expect(afterCursor).toBe(beforeCursor);
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

  it("stale-session interrupt-task does not close a task whose session has changed", async () => {
    // Simulate the race: scan reads a snapshot with sessionId "s-old" and plans an interrupt-task
    // action. Between planning and applyCommand, the task's session is replaced with "s-new".
    // The expectedSessionId guard on the transition layer must reject the stale command.
    const inner = new InMemoryWorkflowRepository();
    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => started);
    await inner.save(wf, []);
    await applyCommand(inner, {
      kind: "transition-task",
      workflowId: "wf-1",
      transition: { kind: "mark-ready", taskId: "wf-1:task", now: started },
    });
    await applyCommand(inner, {
      kind: "transition-task",
      workflowId: "wf-1",
      transition: { kind: "mark-running", taskId: "wf-1:task", sessionId: "s-old", now: started },
    });

    // After the snapshot is taken by scan, the task restarts with a new session.
    // We model this by wrapping the repo: the first get() returns the old snapshot (s-old),
    // but the underlying store already has s-new by the time applyCommand fetches it.
    const snapshotWithOldSession = await inner.get("wf-1");

    // Transition the live store to s-new (simulating a restart between planning and dispatch).
    await applyCommand(inner, {
      kind: "transition-task",
      workflowId: "wf-1",
      transition: { kind: "recover-task", taskId: "wf-1:task", now: started },
    });
    await applyCommand(inner, {
      kind: "transition-task",
      workflowId: "wf-1",
      transition: { kind: "mark-ready", taskId: "wf-1:task", now: started },
    });
    await applyCommand(inner, {
      kind: "transition-task",
      workflowId: "wf-1",
      transition: { kind: "mark-running", taskId: "wf-1:task", sessionId: "s-new", now: started },
    });

    // Wrap the repo so scan sees the old snapshot (triggering interrupt-task with sessionId "s-old"),
    // while applyCommand reads the live state (sessionId "s-new").
    let firstGet = true;
    const staleScanRepo: WorkflowRepository = {
      get: async (id) => {
        if (firstGet) {
          firstGet = false;
          return snapshotWithOldSession;
        }
        return inner.get(id);
      },
      save: (w, e, i) => inner.save(w, e, i),
      eventsSince: (id, cursor) => inner.eventsSince(id, cursor),
      subscribe: (id, cursor) => inner.subscribe(id, cursor),
      lookupIdempotency: (id, key) => inner.lookupIdempotency(id, key),
      listRecoverable: () => inner.listRecoverable(),
    };

    const service = createRecoveryService(
      staleScanRepo,
      new NoopRestackExecutor(),
      new StubRuntimeBackend(),
      () => started,
    );

    await expect(
      service.scan("wf-1", {
        ...defaultOptions,
        runtimeProbes: { "s-old": "missing" as RuntimeProbeState },
      }),
    ).rejects.toMatchObject({ code: "invalid_transition" });

    // The task must remain running with s-new — the stale interrupt did not close it.
    const saved = await inner.get("wf-1");
    expect(saved?.graph["wf-1:task"]?.executionStatus).toBe("running");
    expect(saved?.graph["wf-1:task"]?.sessionId).toBe("s-new");
  });
});
