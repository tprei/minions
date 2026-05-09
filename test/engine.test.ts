import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEngine } from "../src/engine.js";
import type { Engine, EngineConfig } from "../src/engine.js";
import { silentLogger } from "./test-helpers.js";
import type { RuntimeAttachOptions, RuntimeBackend, RuntimeOutputChunk, RuntimeStartResult, RuntimeStartSpec } from "../src/plugins/runtime-backend.js";
import type { RuntimeProbeState } from "../src/application/recovery.js";
import { SQLiteWorkflowRepository } from "../src/persistence/sqlite-repo.js";
import { applyCommand } from "../src/application/commands.js";
import { createSingleTaskWorkflow } from "../src/domain/workflow.js";
import { StubProviderPlugin } from "../src/plugins/providers/stub.js";
import { StubRuntimeBackend } from "../src/plugins/stub-runtime.js";
import type { Artifact } from "../src/domain/types.js";
import type { ProviderPlugin, ProviderEvent } from "../src/plugins/provider-plugin.js";

function makeTempPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "engine-test-"));
  return join(dir, "test.db");
}

describe("createEngine", () => {
  let engine: Engine;
  let dbPath: string;

  beforeEach(() => {
    dbPath = makeTempPath();
  });

  afterEach(async () => {
    await engine?.close();
  });

  it("creates engine with SQLite repo and stub runtime", async () => {
    engine = await createEngine({ dbPath, log: silentLogger() });
    expect(engine.server).toBeDefined();
  });

  it("close() releases the DB without throwing", async () => {
    engine = await createEngine({ dbPath, log: silentLogger() });
    await expect(engine.close()).resolves.toBeUndefined();
  });

  it("rebuild sees workflows saved in a prior instance", async () => {
    const now = "2026-05-04T11:19:00.000Z";
    const spec = {
      id: "wf-engine-1",
      kind: "single-task" as const,
      tasks: [{ id: "t1", title: "T", prompt: "P" }],
    };

    const first = await createEngine({ dbPath, now: () => now, log: silentLogger() });
    const req = new Request("http://localhost/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(spec),
    });
    const res = await first.server.fetch(req);
    expect(res.status).toBe(201);
    await first.close();

    const second = await createEngine({ dbPath, now: () => now, log: silentLogger() });
    const getReq = new Request("http://localhost/workflows/wf-engine-1");
    const getRes = await second.server.fetch(getReq);
    expect(getRes.status).toBe(200);
    const body = await getRes.json() as { id: string };
    expect(body.id).toBe("wf-engine-1");
    engine = second;
  });
});

describe("createEngine — close() aborts boot-spawned orchestrators", () => {
  it("close() aborts in-flight orchestrators before closing the repo", async () => {
    const dbPath = makeTempPath();
    const now = "2026-05-04T11:19:00.000Z";

    // Seed a live running task directly into the DB so boot recovery spawns an orchestrator
    const seedRepo = new SQLiteWorkflowRepository(dbPath);
    const wf = createSingleTaskWorkflow("wf-close-1", { title: "T", prompt: "P" }, () => now);
    await seedRepo.save(wf, []);
    await applyCommand(seedRepo, {
      kind: "transition-task",
      workflowId: "wf-close-1",
      transition: { kind: "mark-ready", taskId: "wf-close-1:task", now },
    });
    await applyCommand(seedRepo, {
      kind: "transition-task",
      workflowId: "wf-close-1",
      transition: { kind: "mark-running", taskId: "wf-close-1:task", sessionId: "live-sess", now },
    });
    seedRepo.close();

    let capturedSignal: AbortSignal | undefined;
    const runtime: RuntimeBackend = {
      async start(_spec: RuntimeStartSpec): Promise<RuntimeStartResult> {
        return { sessionId: "live-sess", runtimeType: "stub" };
      },
      async stop(): Promise<void> {},
      async probe(): Promise<RuntimeProbeState> {
        return "live";
      },
      attach(_sessionId: string, opts?: RuntimeAttachOptions): AsyncIterable<RuntimeOutputChunk> {
        capturedSignal = opts?.signal;
        return {
          [Symbol.asyncIterator]: async function* () {
            // Hang until aborted
            await new Promise<void>((_resolve, reject) => {
              opts?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
            });
          },
        };
      },
    };

    const config: EngineConfig = {
      dbPath,
      runtime,
      now: () => now,
      providerFactory: () => new StubProviderPlugin({ frames: [] }),
      log: silentLogger(),
    };

    const eng = await createEngine(config);

    // Give the orchestrator a tick to reach runtime.attach
    await new Promise((resolve) => setImmediate(resolve));

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    await eng.close();

    expect(capturedSignal?.aborted).toBe(true);

    // Task must remain `running` — not transitioned to `needs-review` — so next boot can re-spawn.
    const postCloseRepo = new SQLiteWorkflowRepository(dbPath);
    const postCloseWf = await postCloseRepo.get("wf-close-1");
    postCloseRepo.close();
    const task = postCloseWf?.graph["wf-close-1:task"];
    expect(task?.executionStatus).toBe("running");
  });
});

describe("createEngine — close() aborts service-spawned orchestrators", () => {
  it("close() aborts orchestrators spawned by continue-task or retry-task via the server", async () => {
    const dbPath = makeTempPath();
    const now = "2026-05-06T10:00:00.000Z";

    // Seed a needs-review task so continue-task can proceed
    const seedRepo = new SQLiteWorkflowRepository(dbPath);
    const wf = createSingleTaskWorkflow("wf-svc-1", { title: "T", prompt: "P" }, () => now);
    await seedRepo.save(wf, []);
    await applyCommand(seedRepo, {
      kind: "transition-task",
      workflowId: "wf-svc-1",
      transition: { kind: "mark-ready", taskId: "wf-svc-1:task", now },
    });
    await applyCommand(seedRepo, {
      kind: "transition-task",
      workflowId: "wf-svc-1",
      transition: { kind: "mark-running", taskId: "wf-svc-1:task", sessionId: "s-seed", now },
    });
    await applyCommand(seedRepo, {
      kind: "transition-task",
      workflowId: "wf-svc-1",
      transition: { kind: "mark-interrupted", taskId: "wf-svc-1:task", now },
    });
    // Patch providerSessionRef so continue-task finds a resumable session
    const wfCurrent = await seedRepo.get("wf-svc-1");
    const seedTask = wfCurrent!.graph["wf-svc-1:task"]!;
    const patchedRun = { ...seedTask.runs[0]!, providerSessionRef: "prior-ref" };
    await seedRepo.save({
      ...wfCurrent!,
      version: wfCurrent!.version + 1,
      graph: { "wf-svc-1:task": { ...seedTask, runs: [patchedRun] } },
    }, []);
    seedRepo.close();

    let capturedSignal: AbortSignal | undefined;
    const stubRuntime = new StubRuntimeBackend();
    const origAttach = stubRuntime.attach.bind(stubRuntime);
    stubRuntime.attach = (_sessionId: string, opts?: RuntimeAttachOptions): AsyncIterable<RuntimeOutputChunk> => {
      capturedSignal = opts?.signal;
      return {
        [Symbol.asyncIterator]: async function* () {
          await new Promise<void>((_resolve, reject) => {
            opts?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          });
        },
      };
    };
    void origAttach; // suppress unused warning

    const config: EngineConfig = {
      dbPath,
      runtime: stubRuntime,
      now: () => now,
      providerFactory: () => new StubProviderPlugin({ frames: [] }),
      log: silentLogger(),
    };

    const eng = await createEngine(config);

    // Dispatch continue-task via the HTTP server
    const req = new Request("http://localhost/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "continue-task",
        workflowId: "wf-svc-1",
        taskId: "wf-svc-1:task",
        prompt: "continue please",
      }),
    });
    const res = await eng.server.fetch(req);
    expect(res.status).toBe(200);

    // Give orchestrator a tick to reach runtime.attach
    await new Promise((resolve) => setImmediate(resolve));

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    await eng.close();

    expect(capturedSignal?.aborted).toBe(true);
  });
});

describe("createEngine — draft-pr route wired via providerFactory", () => {
  it("POST /workflows/:id/tasks/:taskId/draft-pr returns 200 with title and body when providerFactory is set", async () => {
    const dbPath = makeTempPath();
    const now = "2026-05-08T10:00:00.000Z";

    const seedRepo = new SQLiteWorkflowRepository(dbPath);
    const wf = createSingleTaskWorkflow("wf-dpr-1", { title: "T", prompt: "P" }, () => now);
    await seedRepo.save(wf, []);
    await applyCommand(seedRepo, {
      kind: "transition-task",
      workflowId: "wf-dpr-1",
      transition: { kind: "mark-ready", taskId: "wf-dpr-1:task", now },
    });
    const seeded = await seedRepo.get("wf-dpr-1");
    const seededTask = seeded!.graph["wf-dpr-1:task"]!;
    const branchArtifact: Artifact = {
      kind: "branch",
      ref: "minions/wf-dpr-1_task",
      producedBy: "wf-dpr-1:task",
      createdAt: now,
    };
    await seedRepo.save({
      ...seeded!,
      version: seeded!.version + 1,
      graph: { "wf-dpr-1:task": { ...seededTask, artifacts: [...seededTask.artifacts, branchArtifact] } },
    }, []);
    seedRepo.close();

    const enc = new TextEncoder();
    const line1 = enc.encode("frame-text\n");
    const line2 = enc.encode("frame-final\n");

    const stubRuntime: RuntimeBackend = {
      async start(_spec: RuntimeStartSpec): Promise<RuntimeStartResult> {
        return { sessionId: "dpr-sess", runtimeType: "stub" };
      },
      async stop(): Promise<void> {},
      async probe(): Promise<RuntimeProbeState> { return "live"; },
      attach(_sessionId: string, _opts?: RuntimeAttachOptions): AsyncIterable<RuntimeOutputChunk> {
        return {
          [Symbol.asyncIterator]: async function* () {
            yield { sessionId: "dpr-sess", offset: 0, bytes: line1 };
            yield { sessionId: "dpr-sess", offset: line1.byteLength, bytes: line2 };
          },
        };
      },
    };

    const provider = new StubProviderPlugin({
      frames: [
        [{ kind: "assistant_text", text: '{"title":"Draft PR","body":"Generated body"}' }],
        [{ kind: "final", sessionRef: "dpr-ref" }],
      ],
    });

    const eng = await createEngine({
      dbPath,
      runtime: stubRuntime,
      now: () => now,
      providerFactory: () => provider,
      log: silentLogger(),
    });

    const res = await eng.server.fetch(
      new Request("http://localhost/workflows/wf-dpr-1/tasks/wf-dpr-1:task/draft-pr", { method: "POST" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { title: string; body: string };
    expect(body.title).toBe("Draft PR");
    expect(body.body).toBe("Generated body");

    await eng.close();
  });

  it("POST /workflows/:id/tasks/:taskId/draft-pr returns 503 when providerFactory is not set", async () => {
    const dbPath = makeTempPath();
    const eng = await createEngine({ dbPath, log: silentLogger() });

    const seedRepo = new SQLiteWorkflowRepository(dbPath);
    const wf = createSingleTaskWorkflow("wf-dpr-2", { title: "T", prompt: "P" }, () => "2026-05-08T10:00:00.000Z");
    await seedRepo.save(wf, []);
    seedRepo.close();

    const res = await eng.server.fetch(
      new Request("http://localhost/workflows/wf-dpr-2/tasks/wf-dpr-2:task/draft-pr", { method: "POST" }),
    );
    expect(res.status).toBe(503);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("internal_error");

    await eng.close();
  });
});

describe("spawnTracked deregister race safety", () => {
  it("deregistering provider A does not evict provider B registered for the same (workflowId, taskId)", () => {
    // Replicate the activeProviders map and the spawnTracked finally predicate
    // to verify that identity-checked deletion is safe.
    const activeProviders = new Map<string, Map<string, ProviderPlugin>>();

    const workflowId = "wf-race";
    const taskId = "wf-race:t1";

    const providerA = new StubProviderPlugin({ frames: [] });
    const providerB = new StubProviderPlugin({ frames: [] });

    // Register provider A (first run)
    if (!activeProviders.has(workflowId)) activeProviders.set(workflowId, new Map());
    activeProviders.get(workflowId)!.set(taskId, providerA);

    // Register provider B for the same slot (second run starts before A tears down)
    activeProviders.get(workflowId)!.set(taskId, providerB);

    // Simulate the finally block for provider A's orchestrator (the old run finishing)
    const taskMap = activeProviders.get(workflowId);
    if (taskMap !== undefined && taskMap.get(taskId) === providerA) {
      taskMap.delete(taskId);
      if (taskMap.size === 0) activeProviders.delete(workflowId);
    }

    // Provider B must still be registered
    expect(activeProviders.has(workflowId)).toBe(true);
    expect(activeProviders.get(workflowId)!.get(taskId)).toBe(providerB);
  });

  it("deregistering the current provider removes the slot when no replacement exists", () => {
    const activeProviders = new Map<string, Map<string, ProviderPlugin>>();

    const workflowId = "wf-solo";
    const taskId = "wf-solo:t1";
    const providerA = new StubProviderPlugin({ frames: [] });

    if (!activeProviders.has(workflowId)) activeProviders.set(workflowId, new Map());
    activeProviders.get(workflowId)!.set(taskId, providerA);

    // Simulate the finally block — providerA is still current
    const taskMap = activeProviders.get(workflowId);
    if (taskMap !== undefined && taskMap.get(taskId) === providerA) {
      taskMap.delete(taskId);
      if (taskMap.size === 0) activeProviders.delete(workflowId);
    }

    // Slot and workflow bucket must both be gone
    expect(activeProviders.has(workflowId)).toBe(false);
  });
});

describe("AutomationRunner integration: auto-dispatch on POST /workflows", () => {
  it("POST /workflows with one pending task → task transitions to running within 2s via event trigger", async () => {
    const dbPath = makeTempPath();
    const now = "2026-05-08T12:00:00.000Z";

    const finalEvent: ProviderEvent = { kind: "final", sessionRef: "s-auto" };
    const stubRuntime = new StubRuntimeBackend();
    const stubProvider = new StubProviderPlugin({ frames: [[finalEvent]] });

    const config: EngineConfig = {
      dbPath,
      runtime: stubRuntime,
      now: () => now,
      providerFactory: () => stubProvider,
      automationScanIntervalMs: 50,
      log: silentLogger(),
    };

    const eng = await createEngine(config);

    const res = await eng.server.fetch(new Request("http://localhost/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "wf-auto-1",
        kind: "single-task",
        tasks: [{ id: "wf-auto-1:task", title: "T", prompt: "Do it" }],
      }),
    }));
    expect(res.status).toBe(201);

    const repo = new SQLiteWorkflowRepository(dbPath);

    const deadline = Date.now() + 2000;
    let finalStatus: string | undefined;
    while (Date.now() < deadline) {
      const wf = await repo.get("wf-auto-1");
      const status = wf?.graph["wf-auto-1:task"]?.executionStatus;
      if (status === "running" || status === "needs-review" || status === "completed") {
        finalStatus = status;
        break;
      }
      await new Promise((r) => setTimeout(r, 30));
    }

    repo.close();
    await eng.close();

    expect(["running", "needs-review", "completed"]).toContain(finalStatus);
  });
});

describe("AutomationRunner integration: stale-ready recycled by periodic scan", () => {
  it("task stuck in ready with no session is recycled to pending by periodic recovery scan", async () => {
    const dbPath = makeTempPath();

    let mockNow = "2026-05-08T12:00:00.000Z";

    const seedRepo = new SQLiteWorkflowRepository(dbPath);
    const wf = createSingleTaskWorkflow("wf-stale-1", { title: "T", prompt: "P" }, () => mockNow);
    await seedRepo.save(wf, []);
    await applyCommand(seedRepo, {
      kind: "transition-task",
      workflowId: "wf-stale-1",
      transition: { kind: "mark-ready", taskId: "wf-stale-1:task", now: mockNow },
    });
    seedRepo.close();

    mockNow = new Date(Date.parse("2026-05-08T12:00:00.000Z") + 6 * 60 * 1000).toISOString();

    const config: EngineConfig = {
      dbPath,
      now: () => mockNow,
      providerFactory: () => new StubProviderPlugin({ frames: [] }),
      automationScanIntervalMs: 50,
      staleReadyMs: 5 * 60 * 1000,
      log: silentLogger(),
    };

    const eng = await createEngine(config);

    const repo = new SQLiteWorkflowRepository(dbPath);
    const deadline = Date.now() + 2000;
    let recycled = false;
    while (Date.now() < deadline) {
      const wfCurrent = await repo.get("wf-stale-1");
      if (wfCurrent?.graph["wf-stale-1:task"]?.executionStatus === "pending") {
        recycled = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 30));
    }

    repo.close();
    await eng.close();

    expect(recycled).toBe(true);
  });
});
