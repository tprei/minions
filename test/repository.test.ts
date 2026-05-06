import { describe, expect, it } from "vitest";
import { InMemoryWorkflowRepository } from "../src/application/repository.js";
import { DomainError } from "../src/domain/errors.js";
import type { WorkflowEvent } from "../src/domain/events.js";
import { createSingleTaskWorkflow } from "../src/domain/workflow.js";

const now = "2026-05-04T11:19:00.000Z";

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

describe("InMemoryWorkflowRepository", () => {
  it("accepts a first save at version 1", async () => {
    const repo = new InMemoryWorkflowRepository();
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await expect(repo.save(workflow, [])).resolves.toBeUndefined();
    await expect(repo.get("wf-1")).resolves.toBe(workflow);
  });

  it("throws version_conflict when saving with a stale version", async () => {
    const repo = new InMemoryWorkflowRepository();
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, []);

    const stale = { ...workflow, version: 1 };
    await expect(repo.save(stale, [])).rejects.toMatchObject({ code: "version_conflict" });
  });

  it("assigns monotonically increasing cursors starting at 1", async () => {
    const repo = new InMemoryWorkflowRepository();
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, [makeEvent("wf-1"), makeEvent("wf-1")]);

    const events = await repo.eventsSince("wf-1", 0);
    expect(events.map((e) => e.cursor)).toEqual([1, 2]);
  });

  it("continues cursor sequence across multiple saves", async () => {
    const repo = new InMemoryWorkflowRepository();
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, [makeEvent("wf-1")]);
    await repo.save({ ...workflow, version: 2 }, [makeEvent("wf-1")]);

    const events = await repo.eventsSince("wf-1", 0);
    expect(events.map((e) => e.cursor)).toEqual([1, 2]);
  });

  it("eventsSince returns only events strictly after the given cursor", async () => {
    const repo = new InMemoryWorkflowRepository();
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, [makeEvent("wf-1"), makeEvent("wf-1"), makeEvent("wf-1")]);

    const events = await repo.eventsSince("wf-1", 2);
    expect(events).toHaveLength(1);
    expect(events[0]?.cursor).toBe(3);
  });

  it("idempotency roundtrip: lookup returns what was saved via save()", async () => {
    const repo = new InMemoryWorkflowRepository();
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, [], [{ key: "key-abc", resultRef: "op-1" }]);

    await expect(repo.lookupIdempotency("wf-1", "key-abc")).resolves.toBe("op-1");
  });

  it("idempotency keys are scoped per workflow", async () => {
    const repo = new InMemoryWorkflowRepository();
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, [], [{ key: "key-abc", resultRef: "op-1" }]);

    await expect(repo.lookupIdempotency("wf-2", "key-abc")).resolves.toBeUndefined();
  });

  it("lookupIdempotency returns undefined for unknown key", async () => {
    const repo = new InMemoryWorkflowRepository();
    await expect(repo.lookupIdempotency("wf-1", "missing")).resolves.toBeUndefined();
  });

  it("rejects save when version is not exactly one more than existing", async () => {
    const repo = new InMemoryWorkflowRepository();
    const workflow = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(workflow, []);

    const skipped = { ...workflow, version: 3 };
    await expect(repo.save(skipped, [])).rejects.toBeInstanceOf(DomainError);
  });

  it("listRecoverable returns workflows with non-completed status", async () => {
    const repo = new InMemoryWorkflowRepository();
    const wf1 = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    const wf2 = createSingleTaskWorkflow("wf-2", { title: "T2", prompt: "P2" }, () => now);
    await repo.save(wf1, []);
    await repo.save(wf2, []);

    const recoverable = await repo.listRecoverable();
    expect(recoverable.map((w) => w.id).sort()).toEqual(["wf-1", "wf-2"]);
  });

  it("listRecoverable excludes completed workflows", async () => {
    const repo = new InMemoryWorkflowRepository();
    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(wf, []);
    const completed = { ...wf, version: 2, status: "completed" as const };
    await repo.save(completed, []);

    const recoverable = await repo.listRecoverable();
    expect(recoverable).toHaveLength(0);
  });
});
