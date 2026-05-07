import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEngine } from "../src/engine.js";
import type { Engine, EngineConfig } from "../src/engine.js";
import type { RuntimeAttachOptions, RuntimeBackend, RuntimeOutputChunk, RuntimeStartResult, RuntimeStartSpec } from "../src/plugins/runtime-backend.js";
import type { RuntimeProbeState } from "../src/application/recovery.js";
import { SQLiteWorkflowRepository } from "../src/persistence/sqlite-repo.js";
import { applyCommand } from "../src/application/commands.js";
import { createSingleTaskWorkflow } from "../src/domain/workflow.js";
import { StubProviderPlugin } from "../src/plugins/providers/stub.js";

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
    engine = await createEngine({ dbPath });
    expect(engine.server).toBeDefined();
  });

  it("close() releases the DB without throwing", async () => {
    engine = await createEngine({ dbPath });
    await expect(engine.close()).resolves.toBeUndefined();
  });

  it("rebuild sees workflows saved in a prior instance", async () => {
    const now = "2026-05-04T11:19:00.000Z";
    const spec = {
      id: "wf-engine-1",
      kind: "single-task" as const,
      tasks: [{ id: "t1", title: "T", prompt: "P" }],
    };

    const first = await createEngine({ dbPath, now: () => now });
    const req = new Request("http://localhost/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(spec),
    });
    const res = await first.server.fetch(req);
    expect(res.status).toBe(201);
    await first.close();

    const second = await createEngine({ dbPath, now: () => now });
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
    };

    const eng = await createEngine(config);

    // Give the orchestrator a tick to reach runtime.attach
    await new Promise((resolve) => setImmediate(resolve));

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    await eng.close();

    expect(capturedSignal?.aborted).toBe(true);
  });
});
