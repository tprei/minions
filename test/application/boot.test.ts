import { describe, expect, it, vi } from "vitest";
import { runBootRecovery } from "../../src/application/boot.js";
import { applyCommand } from "../../src/application/commands.js";
import { createRecoveryService } from "../../src/application/recovery-service.js";
import { NoopRestackExecutor } from "../../src/application/restack-executor.js";
import { InMemoryWorkflowRepository } from "../../src/application/repository.js";
import { StubRuntimeBackend } from "../../src/plugins/stub-runtime.js";
import { createSingleTaskWorkflow } from "../../src/domain/workflow.js";

const started = "2026-05-04T11:19:00.000Z";
const staleNow = "2026-05-04T11:21:00.000Z"; // 2 min later, staleReadyMs = 60s

const bootOptions = {
  now: () => staleNow,
  staleReadyMs: 60_000,
  staleGateMs: 300_000,
};

describe("runBootRecovery", () => {
  it("no-op when there are no recoverable workflows", async () => {
    const repo = new InMemoryWorkflowRepository();
    const runtime = new StubRuntimeBackend();
    const service = createRecoveryService(repo, new NoopRestackExecutor(), runtime, () => staleNow);

    await expect(runBootRecovery(repo, service, runtime, bootOptions)).resolves.toBeUndefined();
  });

  it("recovers a stale-ready task back to pending on boot", async () => {
    const repo = new InMemoryWorkflowRepository();
    const runtime = new StubRuntimeBackend();
    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => started);
    await repo.save(wf, []);
    await applyCommand(repo, {
      kind: "transition-task",
      workflowId: "wf-1",
      transition: { kind: "mark-ready", taskId: "wf-1:task", now: started },
    });

    const service = createRecoveryService(repo, new NoopRestackExecutor(), runtime, () => staleNow);
    await runBootRecovery(repo, service, runtime, bootOptions);

    const saved = await repo.get("wf-1");
    expect(saved?.graph["wf-1:task"]?.executionStatus).toBe("pending");
  });

  it("probes runtime for tasks with sessionId", async () => {
    const repo = new InMemoryWorkflowRepository();
    const runtime = new StubRuntimeBackend();
    const probeSpy = vi.spyOn(runtime, "probe");

    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => started);
    // Manually inject sessionId into a running task
    const taskWithSession = {
      ...wf.graph["wf-1:task"]!,
      executionStatus: "running" as const,
      sessionId: "stub-session-1",
    };
    const wfWithSession = {
      ...wf,
      graph: { "wf-1:task": taskWithSession },
    };
    await repo.save(wfWithSession, []);

    const service = createRecoveryService(repo, new NoopRestackExecutor(), runtime, () => staleNow);
    await runBootRecovery(repo, service, runtime, bootOptions);

    expect(probeSpy).toHaveBeenCalledWith("stub-session-1");
  });

  it("cancelled workflow with live sessionId triggers stop on boot", async () => {
    const repo = new InMemoryWorkflowRepository();
    const runtime = new StubRuntimeBackend();
    const stopSpy = vi.spyOn(runtime, "stop");

    // Start a session on the runtime so probe returns "live"
    const { sessionId } = await runtime.start({
      taskId: "wf-1:task",
      workflowId: "wf-1",
      command: ["echo"],
    });

    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => started);
    // Task is "running" with a session — workflow cancelled but task not yet cancelled
    const taskWithSession = {
      ...wf.graph["wf-1:task"]!,
      executionStatus: "running" as const,
      sessionId,
    };
    const cancelledWf = {
      ...wf,
      status: "cancelled" as const,
      graph: { "wf-1:task": taskWithSession },
    };
    await repo.save(cancelledWf, []);

    const service = createRecoveryService(repo, new NoopRestackExecutor(), runtime, () => staleNow);
    await runBootRecovery(repo, service, runtime, bootOptions);

    expect(stopSpy).toHaveBeenCalledWith(sessionId);
  });

  it("second runBootRecovery is idempotent (idempotency rows prevent re-dispatch)", async () => {
    const repo = new InMemoryWorkflowRepository();
    const runtime = new StubRuntimeBackend();
    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => started);
    await repo.save(wf, []);
    await applyCommand(repo, {
      kind: "transition-task",
      workflowId: "wf-1",
      transition: { kind: "mark-ready", taskId: "wf-1:task", now: started },
    });

    const service = createRecoveryService(repo, new NoopRestackExecutor(), runtime, () => staleNow);
    await runBootRecovery(repo, service, runtime, bootOptions);

    const afterFirst = (await repo.eventsSince("wf-1", 0)).length;

    await runBootRecovery(repo, service, runtime, bootOptions);

    const afterSecond = (await repo.eventsSince("wf-1", 0)).length;
    expect(afterSecond).toBe(afterFirst);
  });

  it("live runtime probe for a running task produces no recovery action", async () => {
    const repo = new InMemoryWorkflowRepository();
    const runtime = new StubRuntimeBackend();

    const { sessionId } = await runtime.start({
      taskId: "wf-1:task",
      workflowId: "wf-1",
      command: ["echo"],
    });

    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => started);
    const taskRunning = {
      ...wf.graph["wf-1:task"]!,
      executionStatus: "running" as const,
      sessionId,
    };
    const runningWf = { ...wf, graph: { "wf-1:task": taskRunning } };
    await repo.save(runningWf, []);

    const service = createRecoveryService(repo, new NoopRestackExecutor(), runtime, () => staleNow);
    await runBootRecovery(repo, service, runtime, bootOptions);

    const saved = await repo.get("wf-1");
    expect(saved?.graph["wf-1:task"]?.executionStatus).toBe("running");
  });
});
