import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationRunner } from "../../src/application/automation-runner.js";
import type { AutomationRunnerDeps } from "../../src/application/automation-runner.js";
import { applyCommand } from "../../src/application/commands.js";
import type { Command, CommandResult } from "../../src/application/commands.js";
import { createRecoveryService } from "../../src/application/recovery-service.js";
import { InMemoryWorkflowRepository } from "../../src/application/repository.js";
import { DomainError } from "../../src/domain/errors.js";
import { createSingleTaskWorkflow, createWorkflow } from "../../src/domain/workflow.js";
import { StubProviderPlugin } from "../../src/plugins/providers/stub.js";
import { StubRuntimeBackend } from "../../src/plugins/stub-runtime.js";
import { StubWorkspaceBackend } from "../../src/plugins/workspace/stub-workspace.js";
import { NoopRestackExecutor } from "../../src/application/restack-executor.js";
import { silentLogger } from "../test-helpers.js";

const NOW = "2026-05-08T12:00:00.000Z";

function makeRunner(
  overrides: Partial<AutomationRunnerDeps> = {},
): {
  runner: AutomationRunner;
  repo: InMemoryWorkflowRepository;
  runtime: StubRuntimeBackend;
  workspace: StubWorkspaceBackend;
  provider: StubProviderPlugin;
  spawnOrchestrator: ReturnType<typeof vi.fn>;
  abort: AbortController;
} {
  const repo = new InMemoryWorkflowRepository();
  const runtime = new StubRuntimeBackend();
  const workspace = new StubWorkspaceBackend();
  const finalEvent = { kind: "final" as const, sessionRef: "s-final" };
  const provider = new StubProviderPlugin({ frames: [[finalEvent]] });
  const spawnOrchestrator = vi.fn();
  const abort = new AbortController();
  const executor = new NoopRestackExecutor();
  const recoveryService = createRecoveryService(repo, executor, runtime, () => NOW, silentLogger());

  const deps: AutomationRunnerDeps = {
    repo,
    applyCommand: (cmd) => applyCommand(repo, cmd),
    providerFactory: () => provider,
    runtime,
    workspace,
    spawnOrchestrator,
    publish: vi.fn(),
    now: () => NOW,
    signal: abort.signal,
    log: silentLogger(),
    recoveryService,
    staleReadyMs: 5 * 60 * 1000,
    staleGateMs: 30 * 60 * 1000,
    scanIntervalMs: 0,
    ...overrides,
  };

  const runner = new AutomationRunner(deps);
  return { runner, repo, runtime, workspace, provider, spawnOrchestrator, abort };
}

describe("AutomationRunner.tick", () => {
  it("pending task transitions to running and calls spawnOrchestrator with workflowId/taskId/runId/sessionId", async () => {
    const { runner, repo, spawnOrchestrator } = makeRunner();
    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => NOW);
    await repo.save(wf, []);

    await runner.tick("wf-1");

    const wfAfter = await repo.get("wf-1");
    const task = wfAfter!.graph["wf-1:task"]!;
    expect(task.executionStatus).toBe("running");
    expect(spawnOrchestrator).toHaveBeenCalledOnce();

    const spawnedDeps = spawnOrchestrator.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(spawnedDeps.workflowId).toBe("wf-1");
    expect(spawnedDeps.taskId).toBe("wf-1:task");
    expect(typeof spawnedDeps.runId).toBe("string");
    expect(typeof spawnedDeps.runtimeSessionId).toBe("string");
  });

  it("respects policy.maxConcurrent: 3 tasks with maxConcurrent=2 → only 2 transition per tick", async () => {
    const { runner, repo, spawnOrchestrator } = makeRunner();
    const wf = createWorkflow({
      id: "wf-max",
      kind: "single-task",
      tasks: [
        { id: "wf-max:t1", title: "T1", prompt: "P1" },
        { id: "wf-max:t2", title: "T2", prompt: "P2" },
        { id: "wf-max:t3", title: "T3", prompt: "P3" },
      ],
      policy: { maxConcurrent: 2 },
    }, () => NOW);
    await repo.save(wf, []);

    await runner.tick("wf-max");

    const wfAfter = await repo.get("wf-max");
    const statuses = Object.values(wfAfter!.graph).map((t) => t.executionStatus);
    const running = statuses.filter((s) => s === "running");
    const pending = statuses.filter((s) => s === "pending");
    expect(running.length).toBe(2);
    expect(pending.length).toBe(1);
    expect(spawnOrchestrator).toHaveBeenCalledTimes(2);
  });

  it("no-op when all tasks are running (no candidates)", async () => {
    const { runner, repo, spawnOrchestrator } = makeRunner();
    const wf = createSingleTaskWorkflow("wf-running", { title: "T", prompt: "P" }, () => NOW);
    await repo.save(wf, []);

    await applyCommand(repo, {
      kind: "transition-task",
      workflowId: "wf-running",
      transition: { kind: "mark-ready", taskId: "wf-running:task", now: NOW },
    });
    await applyCommand(repo, {
      kind: "transition-task",
      workflowId: "wf-running",
      transition: { kind: "mark-running", taskId: "wf-running:task", sessionId: "s1", now: NOW },
    });

    await runner.tick("wf-running");

    expect(spawnOrchestrator).not.toHaveBeenCalled();
  });

  it("no-op when workflow.status is not active", async () => {
    const { runner, repo, spawnOrchestrator } = makeRunner();
    const wf = createSingleTaskWorkflow("wf-done", { title: "T", prompt: "P" }, () => NOW);
    await repo.save(wf, []);
    const completed = { ...wf, version: 2, status: "completed" as const };
    await repo.save(completed, []);

    await runner.tick("wf-done");

    expect(spawnOrchestrator).not.toHaveBeenCalled();
  });

  it("swallows version_conflict on mark-ready and continues to next candidate", async () => {
    const repo = new InMemoryWorkflowRepository();
    const spawnOrchestrator = vi.fn();
    const abort = new AbortController();
    const runtime = new StubRuntimeBackend();
    const workspace = new StubWorkspaceBackend();
    const finalEvent = { kind: "final" as const, sessionRef: "s-final" };
    const provider = new StubProviderPlugin({ frames: [[finalEvent], [finalEvent]] });
    const executor = new NoopRestackExecutor();
    const recoveryService = createRecoveryService(repo, executor, runtime, () => NOW, silentLogger());

    const wf = createWorkflow({
      id: "wf-conflict",
      kind: "single-task",
      tasks: [
        { id: "wf-conflict:t1", title: "T1", prompt: "P1" },
        { id: "wf-conflict:t2", title: "T2", prompt: "P2" },
      ],
      policy: { maxConcurrent: 3 },
    }, () => NOW);
    await repo.save(wf, []);

    let markReadyCalls = 0;
    const wrappedApply = async (cmd: Command): Promise<CommandResult> => {
      if (
        cmd.kind === "transition-task" &&
        cmd.transition.kind === "mark-ready" &&
        cmd.transition.taskId === "wf-conflict:t1"
      ) {
        markReadyCalls++;
        throw new DomainError("version_conflict", "concurrent update", { taskId: "wf-conflict:t1" });
      }
      return applyCommand(repo, cmd);
    };

    const runner = new AutomationRunner({
      repo,
      applyCommand: wrappedApply,
      providerFactory: () => provider,
      runtime,
      workspace,
      spawnOrchestrator,
      publish: vi.fn(),
      now: () => NOW,
      signal: abort.signal,
      log: silentLogger(),
      recoveryService,
      staleReadyMs: 5 * 60 * 1000,
      staleGateMs: 30 * 60 * 1000,
      scanIntervalMs: 0,
    });

    await runner.tick("wf-conflict");

    expect(markReadyCalls).toBe(1);
    const wfAfter = await repo.get("wf-conflict");
    const t2 = wfAfter!.graph["wf-conflict:t2"]!;
    expect(t2.executionStatus).toBe("running");
    expect(spawnOrchestrator).toHaveBeenCalledOnce();
  });

  it("workspace.create throws → task left in ready, no spawnOrchestrator, runtime.start not called", async () => {
    const { runner, repo, runtime, workspace, spawnOrchestrator } = makeRunner();
    vi.spyOn(workspace, "create").mockRejectedValue(new Error("workspace unavailable"));
    const startSpy = vi.spyOn(runtime, "start");

    const wf = createSingleTaskWorkflow("wf-ws-fail", { title: "T", prompt: "P" }, () => NOW);
    await repo.save(wf, []);

    await runner.tick("wf-ws-fail");

    const wfAfter = await repo.get("wf-ws-fail");
    expect(wfAfter!.graph["wf-ws-fail:task"]!.executionStatus).toBe("ready");
    expect(spawnOrchestrator).not.toHaveBeenCalled();
    expect(startSpy).not.toHaveBeenCalled();
  });

  it("after workspace.create fails, recovery scan with nowMs past staleReadyMs recycles to pending", async () => {
    const abort = new AbortController();
    const repo = new InMemoryWorkflowRepository();
    const runtime = new StubRuntimeBackend();
    const workspace = new StubWorkspaceBackend();
    vi.spyOn(workspace, "create").mockRejectedValue(new Error("workspace unavailable"));
    const executor = new NoopRestackExecutor();
    const finalEvent = { kind: "final" as const, sessionRef: "s-final" };
    const provider = new StubProviderPlugin({ frames: [[finalEvent]] });

    const recoveryService = createRecoveryService(repo, executor, runtime, () => NOW, silentLogger());

    const runner = new AutomationRunner({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      providerFactory: () => provider,
      runtime,
      workspace,
      spawnOrchestrator: vi.fn(),
      publish: vi.fn(),
      now: () => NOW,
      signal: abort.signal,
      log: silentLogger(),
      recoveryService,
      staleReadyMs: 5 * 60 * 1000,
      staleGateMs: 30 * 60 * 1000,
      scanIntervalMs: 0,
    });

    const wf = createSingleTaskWorkflow("wf-recycle", { title: "T", prompt: "P" }, () => NOW);
    await repo.save(wf, []);

    await runner.tick("wf-recycle");

    const wfMid = await repo.get("wf-recycle");
    expect(wfMid!.graph["wf-recycle:task"]!.executionStatus).toBe("ready");

    const pastStaleMs = Date.parse(NOW) + 6 * 60 * 1000;
    await recoveryService.scan("wf-recycle", {
      nowMs: pastStaleMs,
      staleReadyMs: 5 * 60 * 1000,
      staleGateMs: 30 * 60 * 1000,
      runtimeProbes: {},
      workflowCancelled: false,
    });

    const wfAfter = await repo.get("wf-recycle");
    expect(wfAfter!.graph["wf-recycle:task"]!.executionStatus).toBe("pending");
  });

  it("runtime.start throws → workspace.cleanup called, task left in ready, no spawnOrchestrator", async () => {
    const { runner, repo, runtime, workspace, spawnOrchestrator } = makeRunner();
    vi.spyOn(runtime, "start").mockRejectedValue(new Error("runtime unavailable"));
    const cleanupSpy = vi.spyOn(workspace, "cleanup");

    const wf = createSingleTaskWorkflow("wf-rt-fail", { title: "T", prompt: "P" }, () => NOW);
    await repo.save(wf, []);

    await runner.tick("wf-rt-fail");

    const wfAfter = await repo.get("wf-rt-fail");
    expect(wfAfter!.graph["wf-rt-fail:task"]!.executionStatus).toBe("ready");
    expect(spawnOrchestrator).not.toHaveBeenCalled();
    expect(cleanupSpy).toHaveBeenCalledOnce();
  });

  it("mark-running throws → runtime.stop and workspace.cleanup called, task stays in ready", async () => {
    const repo = new InMemoryWorkflowRepository();
    const runtime = new StubRuntimeBackend();
    const workspace = new StubWorkspaceBackend();
    const stopSpy = vi.spyOn(runtime, "stop");
    const cleanupSpy = vi.spyOn(workspace, "cleanup");
    const finalEvent = { kind: "final" as const, sessionRef: "s-final" };
    const provider = new StubProviderPlugin({ frames: [[finalEvent]] });
    const spawnOrchestrator = vi.fn();
    const abort = new AbortController();
    const executor = new NoopRestackExecutor();
    const recoveryService = createRecoveryService(repo, executor, runtime, () => NOW, silentLogger());

    const wrappedApply = async (cmd: Command): Promise<CommandResult> => {
      if (cmd.kind === "transition-task" && cmd.transition.kind === "mark-running") {
        throw new DomainError("version_conflict", "concurrent update", {});
      }
      return applyCommand(repo, cmd);
    };

    const runner = new AutomationRunner({
      repo,
      applyCommand: wrappedApply,
      providerFactory: () => provider,
      runtime,
      workspace,
      spawnOrchestrator,
      publish: vi.fn(),
      now: () => NOW,
      signal: abort.signal,
      log: silentLogger(),
      recoveryService,
      staleReadyMs: 5 * 60 * 1000,
      staleGateMs: 30 * 60 * 1000,
      scanIntervalMs: 0,
    });

    const wf = createSingleTaskWorkflow("wf-mr-fail", { title: "T", prompt: "P" }, () => NOW);
    await repo.save(wf, []);

    await runner.tick("wf-mr-fail");

    expect(spawnOrchestrator).not.toHaveBeenCalled();
    expect(stopSpy).toHaveBeenCalledOnce();
    expect(cleanupSpy).toHaveBeenCalledOnce();
  });
});

describe("AutomationRunner.notify", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops concurrent notify calls: 100 rapid notify → exactly 1 tick runs", async () => {
    const { runner, repo } = makeRunner();

    let tickCount = 0;
    const originalTick = runner.tick.bind(runner);
    vi.spyOn(runner, "tick").mockImplementation(async (workflowId: string) => {
      tickCount++;
      return originalTick(workflowId);
    });

    const wf = createSingleTaskWorkflow("wf-coalesce", { title: "T", prompt: "P" }, () => NOW);
    await repo.save(wf, []);

    for (let i = 0; i < 100; i++) {
      runner.notify("wf-coalesce");
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(tickCount).toBe(1);
  });

  it("notify during in-flight tick is dropped", async () => {
    const repo = new InMemoryWorkflowRepository();
    const runtime = new StubRuntimeBackend();
    const workspace = new StubWorkspaceBackend();
    const abort = new AbortController();
    const executor = new NoopRestackExecutor();
    const recoveryService = createRecoveryService(repo, executor, runtime, () => NOW, silentLogger());

    let resolveBlock: (() => void) | undefined;
    const blockingApply = async (cmd: Command): Promise<CommandResult> => {
      if (cmd.kind === "transition-task" && cmd.transition.kind === "mark-ready") {
        await new Promise<void>((resolve) => { resolveBlock = resolve; });
      }
      return applyCommand(repo, cmd);
    };

    const finalEvent = { kind: "final" as const, sessionRef: "s-final" };
    const provider = new StubProviderPlugin({ frames: [[finalEvent]] });

    let tickCount = 0;
    const spawnOrchestrator = vi.fn();

    const runner = new AutomationRunner({
      repo,
      applyCommand: blockingApply,
      providerFactory: () => provider,
      runtime,
      workspace,
      spawnOrchestrator,
      publish: vi.fn(),
      now: () => NOW,
      signal: abort.signal,
      log: silentLogger(),
      recoveryService,
      staleReadyMs: 5 * 60 * 1000,
      staleGateMs: 30 * 60 * 1000,
      scanIntervalMs: 0,
    });

    const wrappedTick = runner.tick.bind(runner);
    vi.spyOn(runner, "tick").mockImplementation(async (id: string) => {
      tickCount++;
      return wrappedTick(id);
    });

    const wf = createSingleTaskWorkflow("wf-inflight", { title: "T", prompt: "P" }, () => NOW);
    await repo.save(wf, []);

    runner.notify("wf-inflight");
    await new Promise((r) => setTimeout(r, 0));

    runner.notify("wf-inflight");
    runner.notify("wf-inflight");

    resolveBlock!();
    await new Promise((r) => setTimeout(r, 50));

    expect(tickCount).toBe(1);
  });
});

describe("AutomationRunner periodic loop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("start() with scanIntervalMs=0 disables periodic loop but notify still works", async () => {
    vi.useRealTimers();

    const { runner, repo, spawnOrchestrator } = makeRunner({ scanIntervalMs: 0 });

    const wf = createSingleTaskWorkflow("wf-notify-only", { title: "T", prompt: "P" }, () => NOW);
    await repo.save(wf, []);

    runner.start();
    await new Promise((r) => setTimeout(r, 50));

    runner.notify("wf-notify-only");
    await new Promise((r) => setTimeout(r, 50));

    expect(spawnOrchestrator).toHaveBeenCalled();
  });

  it("start() runs periodic loop: recoveryService.scan + tick called per interval", async () => {
    const repo = new InMemoryWorkflowRepository();
    const runtime = new StubRuntimeBackend();
    const workspace = new StubWorkspaceBackend();
    const executor = new NoopRestackExecutor();
    const abort = new AbortController();
    const finalEvent = { kind: "final" as const, sessionRef: "s-final" };
    const provider = new StubProviderPlugin({ frames: [[finalEvent]] });

    const scanCalls: string[] = [];
    const recoveryService = {
      scan: vi.fn(async (workflowId: string) => {
        scanCalls.push(workflowId);
        return [];
      }),
    };
    void createRecoveryService(repo, executor, runtime, () => NOW, silentLogger());

    const tickCalls: string[] = [];
    const spawnOrchestrator = vi.fn();

    const runner = new AutomationRunner({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      providerFactory: () => provider,
      runtime,
      workspace,
      spawnOrchestrator,
      publish: vi.fn(),
      now: () => NOW,
      signal: abort.signal,
      log: silentLogger(),
      recoveryService,
      staleReadyMs: 5 * 60 * 1000,
      staleGateMs: 30 * 60 * 1000,
      scanIntervalMs: 100,
    });

    vi.spyOn(runner, "tick").mockImplementation(async (id: string) => {
      tickCalls.push(id);
    });

    const wf = createSingleTaskWorkflow("wf-periodic", { title: "T", prompt: "P" }, () => NOW);
    await repo.save(wf, []);

    runner.start();

    await vi.advanceTimersByTimeAsync(250);
    abort.abort();
    await runner.stop();

    expect(tickCalls.filter((id) => id === "wf-periodic").length).toBeGreaterThanOrEqual(2);
    expect(scanCalls.filter((id) => id === "wf-periodic").length).toBeGreaterThanOrEqual(2);
  });
});

describe("AutomationRunner.stop", () => {
  it("aborts and waits for in-flight tick to settle without throwing", async () => {
    const { runner, repo, abort } = makeRunner({ scanIntervalMs: 0 });

    const wf = createSingleTaskWorkflow("wf-stop", { title: "T", prompt: "P" }, () => NOW);
    await repo.save(wf, []);

    runner.start();
    await new Promise((r) => setTimeout(r, 10));

    abort.abort();
    await expect(runner.stop()).resolves.toBeUndefined();
  });
});
