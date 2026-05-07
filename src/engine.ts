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
import { PushService } from "./application/push-service.js";
import type { SubscriptionRepository } from "./application/subscription-repository.js";
import { SQLiteWorkflowRepository } from "./persistence/sqlite-repo.js";
import { SQLiteSubscriptionRepository, listDistinctWorkflowIds } from "./persistence/sqlite-subscription-repo.js";
import type { ProviderPlugin } from "./plugins/provider-plugin.js";
import type { RuntimeBackend } from "./plugins/runtime-backend.js";
import { StubRuntimeBackend } from "./plugins/stub-runtime.js";
import { WebPushSender } from "./plugins/push-sender.js";
import type { PushSender, VapidConfig } from "./plugins/push-sender.js";
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
  vapid?: VapidConfig;
  pushSender?: PushSender;
}

function resolveVapid(config: EngineConfig): VapidConfig | undefined {
  if (config.vapid) return config.vapid;
  const pub = process.env["MWF_VAPID_PUBLIC_KEY"];
  const priv = process.env["MWF_VAPID_PRIVATE_KEY"];
  const subject = process.env["MWF_VAPID_SUBJECT"];
  if (pub && priv && subject) {
    return { publicKey: pub, privateKey: priv, subject };
  }
  return undefined;
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

  const vapid = resolveVapid(config);

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

  let pushAbort: AbortController | undefined;
  let pushService: PushService | undefined;
  let subscriptions: SubscriptionRepository | undefined;

  if (vapid) {
    pushAbort = new AbortController();
    const db = repo.getDatabase();
    subscriptions = new SQLiteSubscriptionRepository(db);
    const sender: PushSender = config.pushSender ?? new WebPushSender(vapid);
    pushService = new PushService({ workflowRepo: repo, subscriptions, sender, signal: pushAbort.signal });

    const recoverableWorkflows = await repo.listRecoverable();
    const recoverableIds = new Set(recoverableWorkflows.map((w) => w.id));
    const subWorkflowIds = listDistinctWorkflowIds(db);
    const allAttach = new Set([...recoverableIds, ...subWorkflowIds]);
    for (const workflowId of allAttach) {
      pushService.attach(workflowId);
    }
  }

  const serverDeps: Parameters<typeof createServer>[0] = { repo, recoveryService, executor };

  if (vapid && pushService && subscriptions) {
    serverDeps.pushService = pushService;
    serverDeps.subscriptions = subscriptions;
    serverDeps.vapidPublicKey = vapid.publicKey;
  }

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
      pushAbort?.abort();
      for (const entry of activeOrchestrators) {
        entry.controller.abort();
      }
      await Promise.all([...activeOrchestrators].map((e) => e.promise));
      repo.close();
    },
  };
}
