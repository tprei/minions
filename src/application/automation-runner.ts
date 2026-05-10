import { DomainError } from "../domain/errors.js";
import type { ProviderEvent, ProviderPlugin } from "../plugins/provider-plugin.js";
import type { RuntimeBackend } from "../plugins/runtime-backend.js";
import type { WorkspaceBackend } from "../plugins/workspace-backend.js";
import { deriveBranch } from "../plugins/workspace-backend.js";
import type { Logger } from "../observability/logger.js";
import type { Command, CommandResult } from "./commands.js";
import type { WorkflowRepository } from "./repository.js";
import type { RunOrchestratorDeps } from "./run-orchestrator.js";
import type { RecoveryService } from "./recovery-service.js";
import { planDispatch } from "./scheduler.js";
import type { DispatchCandidate } from "./scheduler.js";
import { getOpenRun } from "../domain/runs.js";
import type { Workflow } from "../domain/types.js";

export interface AutomationRunnerDeps {
  repo: WorkflowRepository;
  applyCommand: (cmd: Command) => Promise<CommandResult>;
  providerFactory: () => ProviderPlugin;
  runtime: RuntimeBackend;
  workspace: WorkspaceBackend;
  spawnOrchestrator: (deps: Omit<RunOrchestratorDeps, "signal" | "log">) => void;
  publish: (workflowId: string, taskId: string, runId: string, event: ProviderEvent, seq: number) => void;
  now: () => string;
  signal: AbortSignal;
  log: Logger;
  recoveryService: RecoveryService;
  staleReadyMs: number;
  staleGateMs: number;
  scanIntervalMs?: number;
}

export class AutomationRunner {
  private readonly deps: AutomationRunnerDeps;
  private readonly scanIntervalMs: number;
  private readonly inFlight = new Map<string, Promise<void>>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private periodicDone: Promise<void> | undefined;

  constructor(deps: AutomationRunnerDeps) {
    this.deps = deps;
    this.scanIntervalMs = deps.scanIntervalMs ?? 5_000;
  }

  start(): void {
    void this.runOnce();
    if (this.scanIntervalMs > 0) {
      this.periodicDone = this.runPeriodic();
    }
  }

  async stop(): Promise<void> {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.periodicDone !== undefined) {
      await this.periodicDone.catch(() => {});
    }
    await Promise.all([...this.inFlight.values()].map((p) => p.catch(() => {})));
  }

  notify(workflowId: string): void {
    const existing = this.inFlight.get(workflowId);
    if (existing) return;
    const p = this.tick(workflowId).finally(() => {
      if (this.inFlight.get(workflowId) === p) this.inFlight.delete(workflowId);
    });
    this.inFlight.set(workflowId, p);
  }

  async tick(workflowId: string): Promise<void> {
    const { repo } = this.deps;
    const workflow = await repo.get(workflowId);
    if (!workflow || workflow.status !== "active") return;

    const candidates = planDispatch(workflow);
    for (const candidate of candidates) {
      await this.dispatchCandidate(workflow, candidate);
    }
  }

  private async dispatchCandidate(workflow: Workflow, candidate: DispatchCandidate): Promise<void> {
    const { applyCommand, now, log } = this.deps;
    const { task, dependencyArtifacts } = candidate;
    const workflowId = workflow.id;
    const taskId = task.id;

    let markReadyResult: CommandResult;
    try {
      markReadyResult = await applyCommand({
        kind: "transition-task",
        workflowId,
        transition: { kind: "mark-ready", taskId, expectedVersion: task.version, now: now() },
      });
    } catch (err) {
      if (err instanceof DomainError && (err.code === "version_conflict" || err.code === "invalid_transition")) {
        log.debug("automation-runner mark-ready skipped", { workflowId, taskId, error: err.message });
        return;
      }
      throw err;
    }

    void markReadyResult;

    let handle: Awaited<ReturnType<typeof this.deps.workspace.create>>;
    try {
      handle = await this.deps.workspace.create({
        workflowId,
        taskId,
        branch: deriveBranch(workflowId, taskId),
        mode: "worktree",
        resetBranch: true,
      });
    } catch (err) {
      log.error("automation-runner workspace.create failed", { workflowId, taskId, error: (err as Error).message });
      return;
    }

    let runtimeSessionId: string;
    let runtimeType: string;
    let provider: ProviderPlugin;
    let providerType: string;
    try {
      provider = this.deps.providerFactory();
      const invocation = await provider.prepare({ taskId, workflowId, prompt: task.prompt, dependencyArtifacts });
      providerType = invocation.providerType;
      const startSpec: { taskId: string; workflowId: string; command: string[]; env?: Record<string, string>; workspacePath?: string } = {
        taskId,
        workflowId,
        command: invocation.command,
        workspacePath: handle.containerPath,
      };
      if (invocation.env !== undefined) startSpec.env = invocation.env;
      const startResult = await this.deps.runtime.start(startSpec);
      runtimeSessionId = startResult.sessionId;
      runtimeType = startResult.runtimeType;
    } catch (err) {
      log.error("automation-runner prep failed", { workflowId, taskId, error: (err as Error).message });
      await this.deps.workspace.cleanup(handle.workspaceId).catch(() => {});
      return;
    }

    let runningResult: CommandResult;
    try {
      runningResult = await applyCommand({
        kind: "transition-task",
        workflowId,
        transition: {
          kind: "mark-running",
          taskId,
          sessionId: runtimeSessionId,
          providerType,
          runtimeType,
          workspaceId: handle.workspaceId,
          now: now(),
        },
      });
    } catch (err) {
      log.error("automation-runner mark-running failed", { workflowId, taskId, error: (err as Error).message });
      await this.deps.runtime.stop(runtimeSessionId).catch(() => {});
      await this.deps.workspace.cleanup(handle.workspaceId).catch(() => {});
      return;
    }

    const postTask = runningResult.workflow.graph[taskId];
    const openRun = postTask ? getOpenRun(postTask.runs) : undefined;
    if (!openRun) {
      log.error("automation-runner no open run after mark-running", { workflowId, taskId, error: "no open run" });
      return;
    }
    const runId = openRun.id;
    const { publish, now: nowFn } = this.deps;

    this.deps.spawnOrchestrator({
      workflowId,
      taskId,
      runId,
      runtimeSessionId,
      provider,
      runtime: this.deps.runtime,
      workspace: this.deps.workspace,
      workspaceId: handle.workspaceId,
      applyCommand,
      publish: (providerEvent, seq) => publish(workflowId, taskId, runId, providerEvent, seq),
      now: nowFn,
    });
  }

  private async runOnce(): Promise<void> {
    const { repo, recoveryService, now, staleReadyMs, staleGateMs, log, signal } = this.deps;
    try {
      const workflows = await repo.list({ includeCompleted: false });
      for (const w of workflows) {
        if (signal.aborted) break;
        await recoveryService.scan(w.id, {
          nowMs: Date.parse(now()),
          staleReadyMs,
          staleGateMs,
          runtimeProbes: {},
          workflowCancelled: w.status === "cancelled",
        });
        await this.tick(w.id);
      }
    } catch (err) {
      log.error("automation-runner runOnce error", { error: (err as Error).message });
    }
  }

  private async runPeriodic(): Promise<void> {
    const { repo, recoveryService, now, staleReadyMs, staleGateMs, log, signal } = this.deps;
    while (!signal.aborted) {
      await this.sleep(this.scanIntervalMs);
      if (signal.aborted) break;
      try {
        const workflows = await repo.list({ includeCompleted: false });
        for (const w of workflows) {
          if (signal.aborted) break;
          await recoveryService.scan(w.id, {
            nowMs: Date.parse(now()),
            staleReadyMs,
            staleGateMs,
            runtimeProbes: {},
            workflowCancelled: w.status === "cancelled",
          });
          await this.tick(w.id);
        }
      } catch (err) {
        log.error("automation-runner periodic scan error", { error: (err as Error).message });
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      this.timer = t;
      this.deps.signal.addEventListener("abort", () => {
        clearTimeout(t);
        resolve();
      }, { once: true });
    });
  }
}
