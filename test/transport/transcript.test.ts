import { describe, it, expect, afterEach } from "vitest";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { InMemoryWorkflowRepository } from "../../src/application/repository.js";
import { NoopRestackExecutor } from "../../src/application/restack-executor.js";
import { createRecoveryService } from "../../src/application/recovery-service.js";
import { StubRuntimeBackend } from "../../src/plugins/stub-runtime.js";
import { createServer } from "../../src/transport/server.js";
import { createSingleTaskWorkflow } from "../../src/domain/workflow.js";
import { applyCommand } from "../../src/application/commands.js";
import { silentLogger } from "../test-helpers.js";

const now = "2026-05-04T11:19:00.000Z";

let tmpDir: string;

async function makeApp() {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "transcript-test-"));
  const sessionsDir = path.join(tmpDir, "sessions");
  await fsp.mkdir(sessionsDir, { recursive: true });

  const repo = new InMemoryWorkflowRepository();
  const executor = new NoopRestackExecutor();
  const runtime = new StubRuntimeBackend();
  const recoveryService = createRecoveryService(repo, executor, runtime, () => now, silentLogger());
  const app = createServer({ repo, recoveryService, executor, dataDir: tmpDir });
  return { app, repo, sessionsDir };
}

async function writeLog(sessionsDir: string, sessionId: string, lines: string[]): Promise<void> {
  const logPath = path.join(sessionsDir, `${sessionId}.log`);
  await fsp.writeFile(logPath, lines.join("\n") + (lines.length > 0 ? "\n" : ""));
}

async function createRunningTask(repo: InMemoryWorkflowRepository, sessionId: string) {
  const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
  await repo.save(wf, []);
  const taskId = Object.keys(wf.graph)[0]!;

  await applyCommand(repo, {
    kind: "transition-task",
    workflowId: wf.id,
    transition: { kind: "mark-ready", taskId, expectedVersion: 1, now },
  });

  await applyCommand(repo, {
    kind: "transition-task",
    workflowId: wf.id,
    transition: {
      kind: "mark-running",
      taskId,
      sessionId,
      providerType: "claude-code",
      runtimeType: "tmux",
      workspaceId: "ws-1",
      now,
    },
  });

  return { workflowId: wf.id, taskId };
}

describe("GET /workflows/:id/tasks/:taskId/transcript", () => {
  afterEach(async () => {
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns 404 when workflow not found", async () => {
    const { app } = await makeApp();
    const res = await app.request("/workflows/nonexistent/tasks/t-1/transcript");
    expect(res.status).toBe(404);
  });

  it("returns 404 when task not found", async () => {
    const { app, repo } = await makeApp();
    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(wf, []);
    const res = await app.request("/workflows/wf-1/tasks/nonexistent-task/transcript");
    expect(res.status).toBe(404);
  });

  it("returns empty events when task has no runs", async () => {
    const { app, repo } = await makeApp();
    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(wf, []);
    const taskId = Object.keys(wf.graph)[0]!;
    const res = await app.request(`/workflows/wf-1/tasks/${taskId}/transcript`);
    expect(res.status).toBe(200);
    const body = await res.json() as { events: unknown[]; cutoff: null };
    expect(body.events).toHaveLength(0);
    expect(body.cutoff).toBeNull();
  });

  it("returns empty events when log file does not exist", async () => {
    const { app, repo } = await makeApp();
    const sessionId = "missing-session";
    const { workflowId, taskId } = await createRunningTask(repo, sessionId);
    const res = await app.request(`/workflows/${workflowId}/tasks/${taskId}/transcript`);
    expect(res.status).toBe(200);
    const body = await res.json() as { events: unknown[]; cutoff: null };
    expect(body.events).toHaveLength(0);
    expect(body.cutoff).toBeNull();
  });

  it("parses events from log file", async () => {
    const { app, repo, sessionsDir } = await makeApp();
    const sessionId = "session-abc";
    const { workflowId, taskId } = await createRunningTask(repo, sessionId);

    const lines = [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "hello" }] } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "world" }] } }),
    ];
    await writeLog(sessionsDir, sessionId, lines);

    const res = await app.request(`/workflows/${workflowId}/tasks/${taskId}/transcript`);
    expect(res.status).toBe(200);
    const body = await res.json() as { events: Array<{ runId: string; attempt: number; seq: number; event: { kind: string } }>; cutoff: { runId: string; seq: number } | null };
    expect(body.events).toHaveLength(2);
    expect(body.events[0]).toMatchObject({ attempt: 1, seq: 0, event: { kind: "assistant_text", text: "hello" } });
    expect(body.events[1]).toMatchObject({ attempt: 1, seq: 1, event: { kind: "assistant_text", text: "world" } });
    expect(body.cutoff).not.toBeNull();
    expect(body.cutoff?.seq).toBe(1);
  });

  it("skips malformed lines", async () => {
    const { app, repo, sessionsDir } = await makeApp();
    const sessionId = "session-malformed";
    const { workflowId, taskId } = await createRunningTask(repo, sessionId);

    const lines = [
      "not json garbage",
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "ok" }] } }),
      "",
    ];
    await writeLog(sessionsDir, sessionId, lines);

    const res = await app.request(`/workflows/${workflowId}/tasks/${taskId}/transcript`);
    expect(res.status).toBe(200);
    const body = await res.json() as { events: Array<{ seq: number; event: { kind: string } }>; cutoff: unknown };
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({ seq: 1, event: { kind: "assistant_text" } });
  });

  it("one line with multiple events yields all events with same seq", async () => {
    const { app, repo, sessionsDir } = await makeApp();
    const sessionId = "session-multi";
    const { workflowId, taskId } = await createRunningTask(repo, sessionId);

    const resultLine = JSON.stringify({
      type: "result",
      subtype: "success",
      session_id: "sess-x",
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    await writeLog(sessionsDir, sessionId, [resultLine]);

    const res = await app.request(`/workflows/${workflowId}/tasks/${taskId}/transcript`);
    expect(res.status).toBe(200);
    const body = await res.json() as { events: Array<{ seq: number; event: { kind: string } }> };
    expect(body.events).toHaveLength(2);
    expect(body.events[0]).toMatchObject({ seq: 0, event: { kind: "usage" } });
    expect(body.events[1]).toMatchObject({ seq: 0, event: { kind: "final" } });
  });
});
