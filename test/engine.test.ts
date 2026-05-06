import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEngine } from "../src/engine.js";
import type { Engine } from "../src/engine.js";

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
