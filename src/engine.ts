import type { Hono } from "hono";
import { dirname } from "node:path";
import { runBootRecovery } from "./application/boot.js";
import type { BootRecoveryReport, BootRespawnContext } from "./application/boot.js";
import { applyCommand } from "./application/commands.js";
import { ContinueTaskService } from "./application/continue-task-service.js";
import { createRecoveryService } from "./application/recovery-service.js";
import { NoopRestackExecutor } from "./application/restack-executor.js";
import type { RestackExecutor } from "./application/restack-executor.js";
import { RunOrchestrator } from "./application/run-orchestrator.js";
import type { RunOrchestratorDeps } from "./application/run-orchestrator.js";
import { SQLiteWorkflowRepository } from "./persistence/sqlite-repo.js";
import type { ProviderPlugin } from "./plugins/provider-plugin.js";
import type { RuntimeBackend } from "./plugins/runtime-backend.js";
import { StubRuntimeBackend } from "./plugins/stub-runtime.js";
import { createServer } from "./transport/server.js";

export interface EngineConfig {
  dbPath: string;
  dataDir?: string;
  runtime?: RuntimeBackend;
  executor?: RestackExecutor;
  providerFactory?: () => ProviderPlugin;
  staleReadyMs?: number;
  staleGateMs?: number;
  now?: () => string;
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

  const repo = new SQLiteWorkflowRepository(config.dbPath);
  const recoveryService = createRecoveryService(repo, executor, runtime, now);

  const spawnOrchestrator = config.providerFactory
    ? (ctx: BootRespawnContext) => {
        const provider = config.providerFactory!();
        const deps: RunOrchestratorDeps = {
          workflowId: ctx.workflowId,
          taskId: ctx.taskId,
          runtimeSessionId: ctx.runtimeSessionId,
          provider,
          runtime,
          applyCommand: (cmd) => applyCommand(repo, cmd),
          now,
        };
        if (ctx.fromOffset !== undefined) deps.fromOffset = ctx.fromOffset;
        const orch = new RunOrchestrator(deps);
        orch.run().catch((err) => console.error("boot run-orchestrator error:", err));
      }
    : undefined;

  const bootRecoveryOpts: Parameters<typeof runBootRecovery>[3] = {
    now,
    staleReadyMs,
    staleGateMs,
  };
  if (spawnOrchestrator !== undefined) bootRecoveryOpts.spawnOrchestrator = spawnOrchestrator;

  const bootReport = await runBootRecovery(repo, recoveryService, runtime, bootRecoveryOpts);

  const serverDeps: Parameters<typeof createServer>[0] = { repo, recoveryService, executor };

  if (config.providerFactory) {
    serverDeps.continueTaskService = new ContinueTaskService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      providerFactory: config.providerFactory,
      runtime,
      now,
    });
  }

  const server = createServer(serverDeps);

  return {
    server,
    bootReport,
    dataDir,
    async close() {
      repo.close();
    },
  };
}
