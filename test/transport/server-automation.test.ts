import { describe, expect, it, vi } from "vitest";
import { NoopRestackExecutor } from "../../src/application/restack-executor.js";
import { InMemoryWorkflowRepository } from "../../src/application/repository.js";
import { createRecoveryService } from "../../src/application/recovery-service.js";
import { silentLogger } from "../test-helpers.js";
import { StubRuntimeBackend } from "../../src/plugins/stub-runtime.js";
import { createServer } from "../../src/transport/server.js";
import type { ServerDeps } from "../../src/transport/server.js";

const NOW = "2026-05-08T12:00:00.000Z";

function makeApp(automationRunner?: ServerDeps["automationRunner"]) {
  const repo = new InMemoryWorkflowRepository();
  const executor = new NoopRestackExecutor();
  const runtime = new StubRuntimeBackend();
  const recoveryService = createRecoveryService(repo, executor, runtime, () => NOW, silentLogger());
  const deps: ServerDeps = { repo, recoveryService, executor };
  if (automationRunner !== undefined) deps.automationRunner = automationRunner;
  const app = createServer(deps);
  return { app, repo };
}

describe("POST /workflows automationRunner hook", () => {
  it("calls automationRunner.notify with workflow.id after workflow is saved", async () => {
    const notify = vi.fn();
    const { app } = makeApp({ notify });

    const res = await app.request("/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "wf-hook-1",
        kind: "single-task",
        tasks: [{ id: "t1", title: "Task", prompt: "Do something" }],
      }),
    });

    expect(res.status).toBe(201);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith("wf-hook-1");
  });

  it("does not call notify when automationRunner is absent", async () => {
    const { app } = makeApp();

    const res = await app.request("/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "wf-no-runner",
        kind: "single-task",
        tasks: [{ id: "t1", title: "Task", prompt: "Do something" }],
      }),
    });

    expect(res.status).toBe(201);
  });
});

describe("POST /commands automationRunner hook", () => {
  it("calls automationRunner.notify with body.workflowId after transition-task command", async () => {
    const notify = vi.fn();
    const { app, repo } = makeApp({ notify });

    const { InMemoryWorkflowRepository: _ } = await import("../../src/application/repository.js");
    const { applyCommand } = await import("../../src/application/commands.js");
    const { createSingleTaskWorkflow } = await import("../../src/domain/workflow.js");

    const wf = createSingleTaskWorkflow("wf-cmd-1", { title: "T", prompt: "P" }, () => NOW);
    await repo.save(wf, []);

    const res = await app.request("/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "transition-task",
        workflowId: "wf-cmd-1",
        transition: { kind: "mark-ready", taskId: "wf-cmd-1:task", now: NOW },
      }),
    });

    void applyCommand;
    void _;

    expect(res.status).toBe(200);
    expect(notify).toHaveBeenCalledWith("wf-cmd-1");
  });

  it("does NOT call notify for continue-task command", async () => {
    const notify = vi.fn();
    const { app } = makeApp({ notify });

    const res = await app.request("/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "continue-task",
        workflowId: "wf-continue",
        taskId: "some-task",
        prompt: "continue",
      }),
    });

    expect(res.status).toBe(500);
    expect(notify).not.toHaveBeenCalled();
  });

  it("does NOT call notify when body is malformed (returns 400)", async () => {
    const notify = vi.fn();
    const { app } = makeApp({ notify });

    const res = await app.request("/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });

    expect(res.status).toBe(400);
    expect(notify).not.toHaveBeenCalled();
  });
});
