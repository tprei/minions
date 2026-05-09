import { describe, expect, it, vi } from "vitest";
import { ContinueTaskService } from "../../src/application/continue-task-service.js";
import { applyCommand } from "../../src/application/commands.js";
import { InMemoryWorkflowRepository } from "../../src/application/repository.js";
import { createSingleTaskWorkflow } from "../../src/domain/workflow.js";
import { StubProviderPlugin } from "../../src/plugins/providers/stub.js";
import { StubRuntimeBackend } from "../../src/plugins/stub-runtime.js";
import { StubWorkspaceBackend } from "../../src/plugins/workspace/stub-workspace.js";
import type { NodeRun } from "../../src/domain/runs.js";
import type { ProviderEvent } from "../../src/plugins/provider-plugin.js";

const now = "2026-05-08T10:00:00.000Z";

async function makeNeedsReviewTask(repo: InMemoryWorkflowRepository, providerSessionRef: string) {
  const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
  await repo.save(wf, []);

  await applyCommand(repo, {
    kind: "transition-task",
    workflowId: "wf-1",
    transition: { kind: "mark-ready", taskId: "wf-1:task", now },
  });
  await applyCommand(repo, {
    kind: "transition-task",
    workflowId: "wf-1",
    transition: { kind: "mark-running", taskId: "wf-1:task", sessionId: "s1", now },
  });
  await applyCommand(repo, {
    kind: "transition-task",
    workflowId: "wf-1",
    transition: { kind: "mark-interrupted", taskId: "wf-1:task", now },
  });

  const wfCurrent = await repo.get("wf-1");
  const task = wfCurrent!.graph["wf-1:task"]!;
  const patchedRun: NodeRun = { ...task.runs[0]!, providerSessionRef };
  const patchedWf = {
    ...wfCurrent!,
    version: wfCurrent!.version + 1,
    graph: { "wf-1:task": { ...task, runs: [patchedRun] } },
  };
  await repo.save(patchedWf, []);
}

describe("ContinueTaskService — attachments", () => {
  it("happy path: two comments prepended before the prompt the provider sees", async () => {
    const repo = new InMemoryWorkflowRepository();
    const runtime = new StubRuntimeBackend();
    const finalEvent: ProviderEvent = { kind: "final", sessionRef: "new-session" };
    const provider = new StubProviderPlugin({ frames: [[finalEvent]] });
    const resumeSpy = vi.spyOn(provider, "resume");

    await makeNeedsReviewTask(repo, "prior-ref");

    const service = new ContinueTaskService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      providerFactory: () => provider,
      runtime,
      now: () => now,
      workspace: new StubWorkspaceBackend(),
      spawnOrchestrator: vi.fn(),
    });

    await service.run({
      workflowId: "wf-1",
      taskId: "wf-1:task",
      prompt: "please fix these",
      attachments: [
        { kind: "comment", path: "src/foo.ts", line: 10, body: "null check missing" },
        { kind: "comment", path: "src/bar.ts", line: 42, body: "unused import" },
      ],
    });

    expect(resumeSpy).toHaveBeenCalledOnce();
    const calledPrompt = (resumeSpy.mock.calls[0]?.[0] as { prompt: string }).prompt;
    expect(calledPrompt).toBe(
      "Review comments:\n- src/foo.ts:10 — null check missing\n- src/bar.ts:42 — unused import\n\nplease fix these",
    );
  });

  it("empty attachments array: no prefix, provider receives original prompt", async () => {
    const repo = new InMemoryWorkflowRepository();
    const runtime = new StubRuntimeBackend();
    const finalEvent: ProviderEvent = { kind: "final", sessionRef: "new-session" };
    const provider = new StubProviderPlugin({ frames: [[finalEvent]] });
    const resumeSpy = vi.spyOn(provider, "resume");

    await makeNeedsReviewTask(repo, "prior-ref");

    const service = new ContinueTaskService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      providerFactory: () => provider,
      runtime,
      now: () => now,
      workspace: new StubWorkspaceBackend(),
      spawnOrchestrator: vi.fn(),
    });

    await service.run({
      workflowId: "wf-1",
      taskId: "wf-1:task",
      prompt: "just continue",
      attachments: [],
    });

    expect(resumeSpy).toHaveBeenCalledOnce();
    const calledPrompt = (resumeSpy.mock.calls[0]?.[0] as { prompt: string }).prompt;
    expect(calledPrompt).toBe("just continue");
  });

  it("missing attachments field: no prefix, provider receives original prompt", async () => {
    const repo = new InMemoryWorkflowRepository();
    const runtime = new StubRuntimeBackend();
    const finalEvent: ProviderEvent = { kind: "final", sessionRef: "new-session" };
    const provider = new StubProviderPlugin({ frames: [[finalEvent]] });
    const resumeSpy = vi.spyOn(provider, "resume");

    await makeNeedsReviewTask(repo, "prior-ref");

    const service = new ContinueTaskService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      providerFactory: () => provider,
      runtime,
      now: () => now,
      workspace: new StubWorkspaceBackend(),
      spawnOrchestrator: vi.fn(),
    });

    await service.run({
      workflowId: "wf-1",
      taskId: "wf-1:task",
      prompt: "continue without attachments",
    });

    expect(resumeSpy).toHaveBeenCalledOnce();
    const calledPrompt = (resumeSpy.mock.calls[0]?.[0] as { prompt: string }).prompt;
    expect(calledPrompt).toBe("continue without attachments");
  });
});
