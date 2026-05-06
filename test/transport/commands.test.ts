import { describe, expect, it } from "vitest";
import { NoopRestackExecutor } from "../../src/application/restack-executor.js";
import { InMemoryWorkflowRepository } from "../../src/application/repository.js";
import { createRecoveryService } from "../../src/application/recovery-service.js";
import { createServer } from "../../src/transport/server.js";
import { createSingleTaskWorkflow } from "../../src/domain/workflow.js";

const now = "2026-05-04T11:19:00.000Z";

function makeApp() {
  const repo = new InMemoryWorkflowRepository();
  const executor = new NoopRestackExecutor();
  const recoveryService = createRecoveryService(repo, executor, () => now);
  const app = createServer({ repo, recoveryService, executor });
  return { app, repo };
}

async function seedWorkflow(repo: InMemoryWorkflowRepository) {
  const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
  await repo.save(workflow, []);
  return workflow;
}

describe("POST /commands", () => {
  it("transition-task happy path: mark-ready returns 200 with workflow and events", async () => {
    const { app, repo } = makeApp();
    await seedWorkflow(repo);

    const res = await app.request("/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "transition-task",
        workflowId: "wf-1",
        transition: { kind: "mark-ready", taskId: "wf-1:task", now },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { workflow: { version: number }; events: unknown[] };
    expect(body.workflow.version).toBe(2);
    expect(body.events.length).toBeGreaterThan(0);
  });

  it("returns 404 when workflow does not exist", async () => {
    const { app } = makeApp();

    const res = await app.request("/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "transition-task",
        workflowId: "missing",
        transition: { kind: "mark-ready", taskId: "t", now },
      }),
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("not_found");
  });

  it("returns 400 on invalid_transition (task already ready)", async () => {
    const { app, repo } = makeApp();
    await seedWorkflow(repo);

    // First mark-ready succeeds
    await app.request("/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "transition-task",
        workflowId: "wf-1",
        transition: { kind: "mark-ready", taskId: "wf-1:task", now },
      }),
    });

    // Second mark-ready on same task triggers invalid_transition
    const res = await app.request("/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "transition-task",
        workflowId: "wf-1",
        transition: { kind: "mark-ready", taskId: "wf-1:task", now },
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("invalid_transition");
  });

  it("returns 400 on unknown command kind", async () => {
    const { app } = makeApp();

    const res = await app.request("/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "totally-unknown" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("invalid_kind");
  });

  it("returns 400 on malformed JSON body", async () => {
    const { app } = makeApp();

    const res = await app.request("/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("invalid_body");
  });

  it("returns 409 on version_conflict when expectedVersion does not match", async () => {
    const { app, repo } = makeApp();
    await seedWorkflow(repo);

    const res = await app.request("/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "transition-task",
        workflowId: "wf-1",
        transition: { kind: "mark-ready", taskId: "wf-1:task", expectedVersion: 99, now },
      }),
    });

    expect(res.status).toBe(409);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("version_conflict");
  });

  it("request-restack idempotency: same key twice returns empty events on second call", async () => {
    const { app, repo } = makeApp();
    await seedWorkflow(repo);

    const command = {
      kind: "request-restack",
      workflowId: "wf-1",
      input: { operationId: "op-1", ancestorId: "wf-1:task", idempotencyKey: "k1", now },
    };

    const res1 = await app.request("/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json() as { events: unknown[] };
    expect(body1.events.length).toBeGreaterThan(0);

    const res2 = await app.request("/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...command, input: { ...command.input, operationId: "op-2" } }),
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json() as { events: unknown[] };
    expect(body2.events).toHaveLength(0);
  });
});
