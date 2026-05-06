import type { Hono } from "hono";
import { runBootRecovery } from "./application/boot.js";
import { createRecoveryService } from "./application/recovery-service.js";
import { NoopRestackExecutor } from "./application/restack-executor.js";
import type { RestackExecutor } from "./application/restack-executor.js";
import { SQLiteWorkflowRepository } from "./persistence/sqlite-repo.js";
import type { RuntimeBackend } from "./plugins/runtime-backend.js";
import { StubRuntimeBackend } from "./plugins/stub-runtime.js";
import { createServer } from "./transport/server.js";

export interface EngineConfig {
  dbPath: string;
  runtime?: RuntimeBackend;
  executor?: RestackExecutor;
  staleReadyMs?: number;
  staleGateMs?: number;
  now?: () => string;
}

export interface Engine {
  server: Hono;
  close(): Promise<void>;
}

export async function createEngine(config: EngineConfig): Promise<Engine> {
  const runtime = config.runtime ?? new StubRuntimeBackend();
  const executor = config.executor ?? new NoopRestackExecutor();
  const now = config.now ?? (() => new Date().toISOString());
  const staleReadyMs = config.staleReadyMs ?? 5 * 60 * 1000;
  const staleGateMs = config.staleGateMs ?? 30 * 60 * 1000;

  const repo = new SQLiteWorkflowRepository(config.dbPath);
  const recoveryService = createRecoveryService(repo, executor, runtime, now);

  await runBootRecovery(repo, recoveryService, runtime, { now, staleReadyMs, staleGateMs });

  const server = createServer({ repo, recoveryService, executor });

  return {
    server,
    async close() {
      repo.close();
    },
  };
}
