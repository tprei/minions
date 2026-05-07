import type { Hono } from "hono";
import { dirname, basename, join } from "node:path";
import { runBootRecovery } from "./application/boot.js";
import type { BootRecoveryReport, BootRespawnContext } from "./application/boot.js";
import { applyCommand } from "./application/commands.js";
import { ContinueTaskService } from "./application/continue-task-service.js";
import { RetryTaskService } from "./application/retry-task-service.js";
import { createRecoveryService } from "./application/recovery-service.js";
import { NoopRestackExecutor } from "./application/restack-executor.js";
import type { RestackExecutor } from "./application/restack-executor.js";
import { RunOrchestrator } from "./application/run-orchestrator.js";
import type { RunOrchestratorDeps } from "./application/run-orchestrator.js";
import { SQLiteWorkflowRepository } from "./persistence/sqlite-repo.js";
import type { ProviderPlugin } from "./plugins/provider-plugin.js";
import type { RuntimeBackend } from "./plugins/runtime-backend.js";
import { StubRuntimeBackend } from "./plugins/stub-runtime.js";
import type { WorkspaceBackend } from "./plugins/workspace-backend.js";
import { GitClient } from "./plugins/git/git-client.js";
import { GitWorktreeWorkspaceBackend } from "./plugins/workspace/git-worktree-backend.js";
import { StubWorkspaceBackend } from "./plugins/workspace/stub-workspace.js";
import { createServer } from "./transport/server.js";
import type { WorkflowEvent } from "./domain/events.js";

export interface EngineConfig {
  dbPath: string;
  dataDir?: string;
  runtime?: RuntimeBackend;
  executor?: RestackExecutor;
  providerFactory?: () => ProviderPlugin;
  staleReadyMs?: number;
  staleGateMs?: number;
  now?: () => string;
  workspace?: WorkspaceBackend;
  repoPath?: string;
  workspaceRoot?: string;
  gitCommandPrefix?: readonly string[];
}

export interface Engine {
  server: Hono;
  bootReport: BootRecoveryReport;
  dataDir: string;
  close(): Promise<void>;
}

export async function createEngine(config: EngineConfig): Promise<Engine> {
  const dataDir = config.dataDir ?? `${dirname(config.dbPath)}/sessions`;
  const runtime = config.runtime ?? new StubRuntimeBackend();
  const executor = config.executor ?? new NoopRestackExecutor();
  const now = config.now ?? (() => new Date().toISOString());
  const staleReadyMs = config.staleReadyMs ?? 5 * 60 * 1000;
  const staleGateMs = config.staleGateMs ?? 30 * 60 * 1000;

  let workspace: WorkspaceBackend;
  if (config.workspace) {
    workspace = config.workspace;
  } else if (config.repoPath) {
    const gitCommandPrefix = config.gitCommandPrefix ?? [];
    const gitClient = new GitClient(gitCommandPrefix.length > 0 ? { commandPrefix: gitCommandPrefix } : {});
    const workspaceRoot = config.workspaceRoot ?? join(dirname(config.repoPath), `${basename(config.repoPath)}-worktrees`);
    workspace = await GitWorktreeWorkspaceBackend.create({
      gitClient,
      repoPath: config.repoPath,
      workspaceRoot,
      gitCommandPrefix,
    });
  } else {
    workspace = new StubWorkspaceBackend();
  }

  const repo = new SQLiteWorkflowRepository(config.dbPath);
  const recoveryService = createRecoveryService(repo, executor, runtime, now);

  type ActiveOrchestratorEntry = { controller: AbortController; promise: Promise<void> };
  const activeOrchestrators = new Set<ActiveOrchestratorEntry>();

  const spawnTracked = (deps: Omit<RunOrchestratorDeps, "signal">): void => {
    const controller = new AbortController();
    const entry: ActiveOrchestratorEntry = {
      controller,
      promise: undefined as unknown as Promise<void>,
    };
    activeOrchestrators.add(entry);
    const orch = new RunOrchestrator({ ...deps, signal: controller.signal });
    entry.promise = orch
      .run()
      .catch((err) => console.error("run-orchestrator error:", err))
      .finally(() => { activeOrchestrators.delete(entry); });
  };

  const bootSpawnOrchestrator = config.providerFactory
    ? (ctx: BootRespawnContext) => {
        const provider = config.providerFactory!();
        const deps: Omit<RunOrchestratorDeps, "signal"> = {
          workflowId: ctx.workflowId,
          taskId: ctx.taskId,
          runId: ctx.runId,
          runtimeSessionId: ctx.runtimeSessionId,
          provider,
          runtime,
          workspace,
          // workspaceId from task state; if absent the cleanup is a no-op (stub handles it)
          workspaceId: ctx.workspaceId ?? "",
          applyCommand: (cmd) => applyCommand(repo, cmd),
          publish: (providerEvent) => {
            const envelope: WorkflowEvent = {
              cursor: 0,
              workflowId: ctx.workflowId,
              occurredAt: now(),
              kind: "provider-event",
              payload: { taskId: ctx.taskId, runId: ctx.runId, providerEvent },
            };
            repo.publishTransient(ctx.workflowId, envelope);
          },
          now,
        };
        if (ctx.fromOffset !== undefined) deps.fromOffset = ctx.fromOffset;
        spawnTracked(deps);
      }
    : undefined;

  const bootRecoveryOpts: Parameters<typeof runBootRecovery>[3] = {
    now,
    staleReadyMs,
    staleGateMs,
  };
  if (bootSpawnOrchestrator !== undefined) bootRecoveryOpts.spawnOrchestrator = bootSpawnOrchestrator;

  const bootReport = await runBootRecovery(repo, recoveryService, runtime, bootRecoveryOpts);

  const serverDeps: Parameters<typeof createServer>[0] = { repo, recoveryService, executor };

  if (config.providerFactory) {
    serverDeps.continueTaskService = new ContinueTaskService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      providerFactory: config.providerFactory,
      runtime,
      workspace,
      now,
      spawnOrchestrator: spawnTracked,
    });
    serverDeps.retryTaskService = new RetryTaskService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      providerFactory: config.providerFactory,
      runtime,
      workspace,
      now,
      spawnOrchestrator: spawnTracked,
    });
  }

  const server = createServer(serverDeps);

  return {
    server,
    bootReport,
    dataDir,
    async close() {
      for (const entry of activeOrchestrators) {
        entry.controller.abort();
      }
      await Promise.all([...activeOrchestrators].map((e) => e.promise));
      repo.close();
    },
  };
}
