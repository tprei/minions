import { describe, expect, it, vi, afterEach } from "vitest";
import { PushService } from "../../src/application/push-service.js";
import { silentLogger } from "../test-helpers.js";
import { InMemoryWorkflowRepository } from "../../src/application/repository.js";
import { InMemorySubscriptionRepository } from "../../src/application/subscription-repository.js";
import { StubPushSender } from "../../src/testing/stub-push-sender.js";
import { createSingleTaskWorkflow } from "../../src/domain/workflow.js";
import type { WorkflowEvent } from "../../src/domain/events.js";

const nowStr = "2026-05-08T12:00:00.000Z";
const now = () => nowStr;
const TASK_ID = "wf-1:task";

function completedEvent(workflowId = "wf-1", taskId = TASK_ID): WorkflowEvent {
  return {
    cursor: 1,
    workflowId,
    occurredAt: nowStr,
    kind: "task-transitioned",
    payload: {
      taskId,
      fromExecutionStatus: "running",
      toExecutionStatus: "completed",
      fromStackStatus: "clean",
      toStackStatus: "clean",
      taskVersion: 2,
    },
  };
}

function failedEvent(workflowId = "wf-1", taskId = TASK_ID): WorkflowEvent {
  return {
    cursor: 2,
    workflowId,
    occurredAt: nowStr,
    kind: "task-transitioned",
    payload: {
      taskId,
      fromExecutionStatus: "running",
      toExecutionStatus: "failed",
      fromStackStatus: "clean",
      toStackStatus: "clean",
      taskVersion: 2,
    },
  };
}

async function makeAttached() {
  const workflowRepo = new InMemoryWorkflowRepository();
  const subscriptions = new InMemorySubscriptionRepository();
  const sender = new StubPushSender();
  const controller = new AbortController();

  const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, now);
  await workflowRepo.save(wf, []);
  await subscriptions.upsert({
    endpoint: "https://push.example.com/s1",
    workflowId: "wf-1",
    keys: { p256dh: "k", auth: "a" },
  });

  const service = new PushService({
    workflowRepo,
    subscriptions,
    sender,
    signal: controller.signal,
    log: silentLogger(),
  });
  service.attach("wf-1");
  await new Promise((r) => setImmediate(r));

  return { workflowRepo, subscriptions, sender, controller, service, wf };
}

describe("PushService dedupe — identical (task, kind, code) within 20s", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends only once when the same (taskId, kind, code) fires twice within 20s", async () => {
    const { workflowRepo, sender, controller, wf } = await makeAttached();

    const wf2 = { ...wf, version: wf.version + 1, updatedAt: nowStr };
    await workflowRepo.save(wf2, [completedEvent()]);
    await new Promise((r) => setTimeout(r, 50));

    const wf3 = { ...wf2, version: wf2.version + 1, updatedAt: nowStr };
    await workflowRepo.save(wf3, [completedEvent()]);
    await new Promise((r) => setTimeout(r, 50));

    expect(sender.calls).toHaveLength(1);
    controller.abort();
  });

  it("sends twice when same (taskId, kind, code) fires for different kind (failed vs done)", async () => {
    const { workflowRepo, sender, controller, wf } = await makeAttached();

    const wf2 = { ...wf, version: wf.version + 1, updatedAt: nowStr };
    await workflowRepo.save(wf2, [completedEvent()]);
    await new Promise((r) => setTimeout(r, 50));

    const wf3 = { ...wf2, version: wf2.version + 1, updatedAt: nowStr };
    await workflowRepo.save(wf3, [failedEvent()]);
    await new Promise((r) => setTimeout(r, 50));

    expect(sender.calls).toHaveLength(2);
    controller.abort();
  });

  it("sends twice when same (taskId, kind, code) fires after 21s", async () => {
    vi.useFakeTimers();
    const workflowRepo = new InMemoryWorkflowRepository();
    const subscriptions = new InMemorySubscriptionRepository();
    const sender = new StubPushSender();
    const controller = new AbortController();

    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, now);
    await workflowRepo.save(wf, []);
    await subscriptions.upsert({
      endpoint: "https://push.example.com/s1",
      workflowId: "wf-1",
      keys: { p256dh: "k", auth: "a" },
    });

    const service = new PushService({
      workflowRepo,
      subscriptions,
      sender,
      signal: controller.signal,
      log: silentLogger(),
    });
    service.attach("wf-1");
    await vi.runAllTicks();

    const wf2 = { ...wf, version: wf.version + 1, updatedAt: nowStr };
    await workflowRepo.save(wf2, [completedEvent()]);
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(50);

    vi.advanceTimersByTime(21_000);

    const wf3 = { ...wf2, version: wf2.version + 1, updatedAt: nowStr };
    await workflowRepo.save(wf3, [completedEvent()]);
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(50);

    expect(sender.calls).toHaveLength(2);
    controller.abort();
  });
});
