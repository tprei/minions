import { describe, expect, it } from "vitest";
import { NoopRestackExecutor } from "../../src/application/restack-executor.js";
import { InMemoryWorkflowRepository } from "../../src/application/repository.js";
import { createRecoveryService } from "../../src/application/recovery-service.js";
import { StubRuntimeBackend } from "../../src/plugins/stub-runtime.js";
import { createServer } from "../../src/transport/server.js";
import { createSingleTaskWorkflow } from "../../src/domain/workflow.js";

const now = "2026-05-04T11:19:00.000Z";

function makeApp() {
  const repo = new InMemoryWorkflowRepository();
  const executor = new NoopRestackExecutor();
  const runtime = new StubRuntimeBackend();
  const recoveryService = createRecoveryService(repo, executor, runtime, () => now);
  const app = createServer({ repo, recoveryService, executor });
  return { app, repo };
}

describe("POST /workflows", () => {
  it("creates a workflow and returns 201 with workflow JSON", async () => {
    const { app } = makeApp();

    const res = await app.request("/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "wf-1",
        kind: "single-task",
        tasks: [{ id: "t1", title: "Task", prompt: "Do something" }],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; status: string };
    expect(body.id).toBe("wf-1");
    expect(body.status).toBe("active");
  });

  it("returns 400 on invalid spec (empty tasks array)", async () => {
    const { app } = makeApp();

    const res = await app.request("/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "wf-1", kind: "single-task", tasks: [] }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("invalid_workflow");
  });

  it("returns 400 on malformed JSON body", async () => {
    const { app } = makeApp();

    const res = await app.request("/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("invalid_body");
  });
});

describe("GET /workflows/:id", () => {
  it("returns the workflow snapshot", async () => {
    const { app, repo } = makeApp();
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, []);

    const res = await app.request("/workflows/wf-1");

    expect(res.status).toBe(200);
    const body = await res.json() as { id: string };
    expect(body.id).toBe("wf-1");
  });

  it("returns 404 for unknown workflow id", async () => {
    const { app } = makeApp();

    const res = await app.request("/workflows/nonexistent");

    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("not_found");
  });
});
