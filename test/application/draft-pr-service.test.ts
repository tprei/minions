import { describe, expect, it, vi, afterEach } from "vitest";
import { draftPr, DraftPrError } from "../../src/application/draft-pr-service.js";
import { InMemoryWorkflowRepository } from "../../src/application/repository.js";
import { applyCommand } from "../../src/application/commands.js";
import { DomainError } from "../../src/domain/errors.js";
import { createSingleTaskWorkflow } from "../../src/domain/workflow.js";
import { StubProviderPlugin } from "../../src/plugins/providers/stub.js";
import { StubWorkspaceBackend } from "../../src/plugins/workspace/stub-workspace.js";
import type { ProviderEvent } from "../../src/plugins/provider-plugin.js";
import type { RuntimeBackend, RuntimeAttachOptions, RuntimeOutputChunk } from "../../src/plugins/runtime-backend.js";
import type { RuntimeProbeState } from "../../src/application/recovery.js";
import type { Artifact } from "../../src/domain/types.js";

const now = "2026-05-08T10:00:00.000Z";

function makeChunks(lines: string[]): RuntimeOutputChunk[] {
  const chunks: RuntimeOutputChunk[] = [];
  let offset = 0;
  for (const line of lines) {
    const bytes = new TextEncoder().encode(line + "\n");
    chunks.push({ sessionId: "stub-1", offset, bytes });
    offset += bytes.byteLength;
  }
  return chunks;
}

function makeRuntime(chunks: RuntimeOutputChunk[]): RuntimeBackend {
  return {
    start: vi.fn().mockResolvedValue({ sessionId: "stub-1", runtimeType: "stub" }),
    stop: vi.fn().mockResolvedValue(undefined),
    probe: vi.fn().mockResolvedValue("live" as RuntimeProbeState),
    attach(_sessionId: string, _opts?: RuntimeAttachOptions): AsyncIterable<RuntimeOutputChunk> {
      return {
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      };
    },
  };
}

function makeDeps(
  repo: InMemoryWorkflowRepository,
  providerFrames: ProviderEvent[][],
  chunks: RuntimeOutputChunk[],
) {
  const provider = new StubProviderPlugin({ frames: providerFrames });
  const runtime = makeRuntime(chunks);
  const workspace = new StubWorkspaceBackend();
  return { repo, providerFactory: () => provider, runtime, workspace };
}

async function makeWorkflowWithBranch(repo: InMemoryWorkflowRepository): Promise<void> {
  const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
  await repo.save(wf, []);

  await applyCommand(repo, {
    kind: "transition-task",
    workflowId: "wf-1",
    transition: { kind: "mark-ready", taskId: "wf-1:task", now },
  });

  const current = await repo.get("wf-1");
  const task = current!.graph["wf-1:task"]!;
  const branchArtifact: Artifact = {
    kind: "branch",
    ref: "minions/wf-1_task",
    producedBy: "wf-1:task",
    createdAt: now,
  };
  const patched = {
    ...current!,
    version: current!.version + 1,
    graph: {
      "wf-1:task": {
        ...task,
        artifacts: [...task.artifacts, branchArtifact],
      },
    },
  };
  await repo.save(patched, []);
}

describe("draftPr", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("happy path: provider emits assistant_text with JSON then final → returns title and body", async () => {
    const repo = new InMemoryWorkflowRepository();
    await makeWorkflowWithBranch(repo);

    const textEvent: ProviderEvent = { kind: "assistant_text", text: '{"title":"My PR","body":"Details here"}' };
    const finalEvent: ProviderEvent = { kind: "final", sessionRef: "some-ref" };
    const chunks = makeChunks(["line-1", "line-2"]);
    const deps = makeDeps(repo, [[textEvent], [finalEvent]], chunks);

    const result = await draftPr({ workflowId: "wf-1", taskId: "wf-1:task", deps });

    expect(result.title).toBe("My PR");
    expect(result.body).toBe("Details here");
  });

  it("parse error: provider returns non-JSON assistant_text then final → throws DraftPrError parse_error", async () => {
    const repo = new InMemoryWorkflowRepository();
    await makeWorkflowWithBranch(repo);

    const textEvent: ProviderEvent = { kind: "assistant_text", text: "not-json" };
    const finalEvent: ProviderEvent = { kind: "final", sessionRef: "some-ref" };
    const chunks = makeChunks(["line-1", "line-2"]);
    const deps = makeDeps(repo, [[textEvent], [finalEvent]], chunks);

    let caught: unknown;
    try {
      await draftPr({ workflowId: "wf-1", taskId: "wf-1:task", deps });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(DraftPrError);
    expect((caught as DraftPrError).code).toBe("parse_error");
  });

  it("timeout: provider never emits final → throws DraftPrError timeout after 30s", async () => {
    vi.useFakeTimers();

    const repo = new InMemoryWorkflowRepository();
    await makeWorkflowWithBranch(repo);

    const provider = new StubProviderPlugin({ frames: [] });
    const runtime: RuntimeBackend = {
      start: vi.fn().mockResolvedValue({ sessionId: "stub-1", runtimeType: "stub" }),
      stop: vi.fn().mockResolvedValue(undefined),
      probe: vi.fn().mockResolvedValue("live" as RuntimeProbeState),
      attach(_sessionId: string, opts?: RuntimeAttachOptions): AsyncIterable<RuntimeOutputChunk> {
        return {
          [Symbol.asyncIterator]: async function* () {
            await new Promise<void>((resolve) => {
              if (opts?.signal?.aborted) {
                resolve();
                return;
              }
              opts?.signal?.addEventListener("abort", () => resolve(), { once: true });
            });
          },
        };
      },
    };

    const deps = { repo, providerFactory: () => provider, runtime, workspace: new StubWorkspaceBackend() };

    const resultPromise = draftPr({ workflowId: "wf-1", taskId: "wf-1:task", deps });
    resultPromise.catch(() => {});

    await vi.advanceTimersByTimeAsync(30_000);

    let caught: unknown;
    try {
      await resultPromise;
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(DraftPrError);
    expect((caught as DraftPrError).code).toBe("timeout");
  });

  it("missing branch: workflow has no branch artifact → throws DomainError invalid_transition", async () => {
    const repo = new InMemoryWorkflowRepository();
    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(wf, []);

    const deps = makeDeps(repo, [], []);

    let caught: unknown;
    try {
      await draftPr({ workflowId: "wf-1", taskId: "wf-1:task", deps });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(DomainError);
    expect((caught as DomainError).code).toBe("invalid_transition");
    expect((caught as DomainError).message).toContain("branch artifact");
  });

  it("workflow not found → throws DomainError not_found", async () => {
    const repo = new InMemoryWorkflowRepository();
    const deps = makeDeps(repo, [], []);

    await expect(
      draftPr({ workflowId: "missing-wf", taskId: "missing-wf:task", deps }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("task not found → throws DomainError not_found", async () => {
    const repo = new InMemoryWorkflowRepository();
    const wf = createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now);
    await repo.save(wf, []);

    const deps = makeDeps(repo, [], []);

    await expect(
      draftPr({ workflowId: "wf-1", taskId: "wf-1:no-such-task", deps }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("providerFactory throws → workspace is still cleaned up", async () => {
    const repo = new InMemoryWorkflowRepository();
    await makeWorkflowWithBranch(repo);

    const workspace = new StubWorkspaceBackend();
    const cleanupSpy = vi.spyOn(workspace, "cleanup");

    const runtime: RuntimeBackend = {
      start: vi.fn().mockResolvedValue({ sessionId: "stub-1", runtimeType: "stub" }),
      stop: vi.fn().mockResolvedValue(undefined),
      probe: vi.fn().mockResolvedValue("live" as RuntimeProbeState),
      attach(_sessionId: string, _opts?: RuntimeAttachOptions): AsyncIterable<RuntimeOutputChunk> {
        return {
          [Symbol.asyncIterator]: async function* () {},
        };
      },
    };

    const deps = {
      repo,
      providerFactory: () => {
        throw new Error("provider factory failed");
      },
      runtime,
      workspace,
    };

    await expect(
      draftPr({ workflowId: "wf-1", taskId: "wf-1:task", deps }),
    ).rejects.toThrow("provider factory failed");

    expect(cleanupSpy).toHaveBeenCalledOnce();
  });
});
