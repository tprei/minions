import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SQLiteWorkflowRepository } from "../../src/persistence/sqlite-repo.js";
import type { WorkflowEvent } from "../../src/domain/events.js";
import { createSingleTaskWorkflow } from "../../src/domain/workflow.js";

const now = "2026-05-04T11:19:00.000Z";

function makeTempPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "sqlite-test-"));
  return join(dir, "test.db");
}

function makeEvent(workflowId: string): WorkflowEvent {
  return {
    cursor: 0,
    workflowId,
    kind: "task-transitioned",
    occurredAt: now,
    payload: {
      taskId: "t",
      fromExecutionStatus: "pending",
      toExecutionStatus: "ready",
      fromStackStatus: "clean",
      toStackStatus: "clean",
      taskVersion: 1,
    },
  };
}

async function collectN(iterable: AsyncIterable<WorkflowEvent>, n: number): Promise<WorkflowEvent[]> {
  const collected: WorkflowEvent[] = [];
  for await (const event of iterable) {
    collected.push(event);
    if (collected.length >= n) break;
  }
  return collected;
}

describe("SQLiteWorkflowRepository", () => {
  let repo: SQLiteWorkflowRepository;
  let dbPath: string;

  beforeEach(() => {
    dbPath = makeTempPath();
    repo = new SQLiteWorkflowRepository(dbPath);
  });

  afterEach(() => {
    repo.close();
  });

  it("accepts a first save at version 1", async () => {
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await expect(repo.save(workflow, [])).resolves.toBeUndefined();
    const loaded = await repo.get("wf-1");
    expect(loaded?.id).toBe("wf-1");
    expect(loaded?.version).toBe(1);
  });

  it("throws version_conflict when saving with a stale version", async () => {
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, []);

    const stale = { ...workflow, version: 1 };
    await expect(repo.save(stale, [])).rejects.toMatchObject({ code: "version_conflict" });
  });

  it("assigns monotonically increasing cursors starting at 1", async () => {
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, [makeEvent("wf-1"), makeEvent("wf-1")]);

    const events = await repo.eventsSince("wf-1", 0);
    expect(events.map((e) => e.cursor)).toEqual([1, 2]);
  });

  it("continues cursor sequence across multiple saves", async () => {
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, [makeEvent("wf-1")]);
    await repo.save({ ...workflow, version: 2 }, [makeEvent("wf-1")]);

    const events = await repo.eventsSince("wf-1", 0);
    expect(events.map((e) => e.cursor)).toEqual([1, 2]);
  });

  it("eventsSince returns only events strictly after the given cursor", async () => {
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, [makeEvent("wf-1"), makeEvent("wf-1"), makeEvent("wf-1")]);

    const events = await repo.eventsSince("wf-1", 2);
    expect(events).toHaveLength(1);
    expect(events[0]?.cursor).toBe(3);
  });

  it("idempotency roundtrip: lookup returns what was saved", async () => {
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, [], [{ key: "key-abc", resultRef: "op-1" }]);

    await expect(repo.lookupIdempotency("wf-1", "key-abc")).resolves.toBe("op-1");
  });

  it("idempotency keys are scoped per workflow", async () => {
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, [], [{ key: "key-abc", resultRef: "op-1" }]);

    await expect(repo.lookupIdempotency("wf-2", "key-abc")).resolves.toBeUndefined();
  });

  it("lookupIdempotency returns undefined for unknown key", async () => {
    await expect(repo.lookupIdempotency("wf-1", "missing")).resolves.toBeUndefined();
  });

  it("listRecoverable returns non-completed workflows", async () => {
    const wf1 = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    const wf2 = createSingleTaskWorkflow("wf-2", { title: "T2", prompt: "P2" }, () => now);
    await repo.save(wf1, []);
    await repo.save(wf2, []);

    const recoverable = await repo.listRecoverable();
    expect(recoverable.map((w) => w.id).sort()).toEqual(["wf-1", "wf-2"]);
  });

  it("listRecoverable excludes completed workflows", async () => {
    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(wf, []);
    const completed = { ...wf, version: 2, status: "completed" as const };
    await repo.save(completed, []);

    const recoverable = await repo.listRecoverable();
    expect(recoverable).toHaveLength(0);
  });

  it("durability: data persists after close and reopen", async () => {
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, [makeEvent("wf-1"), makeEvent("wf-1")]);
    await repo.save({ ...workflow, version: 2 }, [makeEvent("wf-1")], [{ key: "idem-1", resultRef: "ref-1" }]);
    repo.close();

    const reopened = new SQLiteWorkflowRepository(dbPath);
    try {
      const loaded = await reopened.get("wf-1");
      expect(loaded?.version).toBe(2);

      const events = await reopened.eventsSince("wf-1", 0);
      expect(events).toHaveLength(3);
      expect(events.map((e) => e.cursor)).toEqual([1, 2, 3]);

      const ref = await reopened.lookupIdempotency("wf-1", "idem-1");
      expect(ref).toBe("ref-1");
    } finally {
      reopened.close();
    }
  });

  it("atomicity: save with conflicting idempotency key throws and leaves state untouched", async () => {
    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(wf, [makeEvent("wf-1")], [{ key: "idem-1", resultRef: "ref-1" }]);

    const v2 = { ...wf, version: 2 };
    await expect(
      repo.save(v2, [makeEvent("wf-1")], [{ key: "idem-1", resultRef: "ref-2" }]),
    ).rejects.toMatchObject({ code: "idempotency_collision" });

    // Workflow version and event count must be unchanged (transaction rolled back)
    const loaded = await repo.get("wf-1");
    expect(loaded?.version).toBe(1);

    const events = await repo.eventsSince("wf-1", 0);
    expect(events).toHaveLength(1);
  });

  it("subscribe: replay-then-live works", async () => {
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, [makeEvent("wf-1"), makeEvent("wf-1")]);

    const iter = repo.subscribe("wf-1", 0)[Symbol.asyncIterator]();

    const r1 = await iter.next();
    const r2 = await iter.next();
    expect(r1.value?.cursor).toBe(1);
    expect(r2.value?.cursor).toBe(2);

    const livePromise = iter.next();
    await Promise.resolve();
    await repo.save({ ...workflow, version: 2 }, [makeEvent("wf-1")]);

    const r3 = await livePromise;
    expect(r3.value?.cursor).toBe(3);

    await iter.return?.();
  });

  it("subscribe: fromCursor filters replay events", async () => {
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, [makeEvent("wf-1"), makeEvent("wf-1"), makeEvent("wf-1")]);

    const events = await collectN(repo.subscribe("wf-1", 2), 1);
    expect(events).toHaveLength(1);
    expect(events[0]?.cursor).toBe(3);
  });
});
