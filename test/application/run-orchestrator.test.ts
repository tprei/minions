import { describe, expect, it, vi } from "vitest";
import { RunOrchestrator } from "../../src/application/run-orchestrator.js";
import { DomainError } from "../../src/domain/errors.js";
import type { Command, CommandResult } from "../../src/application/commands.js";
import type { RuntimeBackend, RuntimeAttachOptions, RuntimeOutputChunk } from "../../src/plugins/runtime-backend.js";
import { StubProviderPlugin } from "../../src/plugins/providers/stub.js";
import { createSingleTaskWorkflow } from "../../src/domain/workflow.js";
import type { ProviderEvent } from "../../src/plugins/provider-plugin.js";
import type { RuntimeProbeState } from "../../src/application/recovery.js";

const now = "2026-05-04T11:19:00.000Z";

function makeCommandResult(): CommandResult {
  return { workflow: createSingleTaskWorkflow("wf-1", { title: "T", prompt: "P" }, () => now), events: [] };
}

function makeChunks(lines: string[], startOffset: number = 0): RuntimeOutputChunk[] {
  const chunks: RuntimeOutputChunk[] = [];
  let offset = startOffset;
  for (const line of lines) {
    const bytes = new TextEncoder().encode(line + "\n");
    chunks.push({ sessionId: "session-1", offset, bytes });
    offset += bytes.byteLength;
  }
  return chunks;
}

function makeRuntime(chunks: RuntimeOutputChunk[], shouldThrow?: Error): RuntimeBackend {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    probe: vi.fn().mockResolvedValue("live" as RuntimeProbeState),
    attach(_sessionId: string, _opts?: RuntimeAttachOptions): AsyncIterable<RuntimeOutputChunk> {
      return {
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
          if (shouldThrow) throw shouldThrow;
        },
      };
    },
  };
}

function makeOrchestrator(
  providerFrames: ProviderEvent[][],
  chunks: RuntimeOutputChunk[],
  applyCommand: (cmd: Command) => Promise<CommandResult>,
  shouldThrow?: Error,
) {
  const provider = new StubProviderPlugin({ frames: providerFrames });
  const runtime = makeRuntime(chunks, shouldThrow);

  return new RunOrchestrator({
    workflowId: "wf-1",
    taskId: "task-1",
    runtimeSessionId: "session-1",
    provider,
    runtime,
    applyCommand,
    now: () => now,
  });
}

describe("RunOrchestrator", () => {
  it("happy path: offset from earlier chunk + final with sessionRef → update-run then complete-runtime in order", async () => {
    const calls: string[] = [];
    const applyCommand = vi.fn(async (cmd: Command): Promise<CommandResult> => {
      if (cmd.kind === "transition-task") calls.push(cmd.transition.kind);
      return makeCommandResult();
    });

    const assistantEvent: ProviderEvent = { kind: "assistant_text", text: "hello" };
    const finalEvent: ProviderEvent = { kind: "final", sessionRef: "abc-ref" };
    const chunks = makeChunks(["line-1", "line-2"], 0);

    const orchestrator = makeOrchestrator([[assistantEvent], [finalEvent]], chunks, applyCommand);
    await orchestrator.run();

    expect(calls).toEqual(["update-run", "complete-runtime"]);

    const updateCall = applyCommand.mock.calls.find(
      ([cmd]) => cmd.kind === "transition-task" && cmd.transition.kind === "update-run",
    );
    expect(updateCall).toBeDefined();
    const t = (updateCall![0] as Extract<Command, { kind: "transition-task" }>).transition;
    expect(t.providerSessionRef).toBe("abc-ref");
    expect(typeof t.outputOffset).toBe("number");
  });

  it("stream throws mid-iteration → best-effort update-run with offset then mark-interrupted", async () => {
    const calls: string[] = [];
    const applyCommand = vi.fn(async (cmd: Command): Promise<CommandResult> => {
      if (cmd.kind === "transition-task") calls.push(cmd.transition.kind);
      return makeCommandResult();
    });

    const chunks = makeChunks(["line-1"], 0);
    const orchestrator = makeOrchestrator([], chunks, applyCommand, new Error("stream exploded"));
    await orchestrator.run();

    expect(calls).toEqual(["update-run", "mark-interrupted"]);

    const updateCall = applyCommand.mock.calls.find(
      ([cmd]) => cmd.kind === "transition-task" && cmd.transition.kind === "update-run",
    );
    const t = (updateCall![0] as Extract<Command, { kind: "transition-task" }>).transition;
    expect(typeof t.outputOffset).toBe("number");
  });

  it("empty final.sessionRef with prior offset → update-run only writes outputOffset, complete-runtime fires", async () => {
    const calls: string[] = [];
    const applyCommand = vi.fn(async (cmd: Command): Promise<CommandResult> => {
      if (cmd.kind === "transition-task") calls.push(cmd.transition.kind);
      return makeCommandResult();
    });

    const assistantEvent: ProviderEvent = { kind: "assistant_text", text: "hi" };
    const finalEvent: ProviderEvent = { kind: "final", sessionRef: "" };
    const chunks = makeChunks(["line-1", "line-2"], 0);

    const orchestrator = makeOrchestrator([[assistantEvent], [finalEvent]], chunks, applyCommand);
    await orchestrator.run();

    expect(calls).toEqual(["update-run", "complete-runtime"]);

    const updateCall = applyCommand.mock.calls.find(
      ([cmd]) => cmd.kind === "transition-task" && cmd.transition.kind === "update-run",
    );
    const t = (updateCall![0] as Extract<Command, { kind: "transition-task" }>).transition;
    expect(t.providerSessionRef).toBeUndefined();
    expect(typeof t.outputOffset).toBe("number");
  });

  it("stream completes without final and without offset → mark-interrupted only, no update-run", async () => {
    const calls: string[] = [];
    const applyCommand = vi.fn(async (cmd: Command): Promise<CommandResult> => {
      if (cmd.kind === "transition-task") calls.push(cmd.transition.kind);
      return makeCommandResult();
    });

    const orchestrator = makeOrchestrator([], [], applyCommand);
    await orchestrator.run();

    expect(calls).toEqual(["mark-interrupted"]);
  });

  it("update-run rejects with version_conflict → orchestrator continues to complete-runtime", async () => {
    const calls: string[] = [];
    const applyCommand = vi.fn(async (cmd: Command): Promise<CommandResult> => {
      if (cmd.kind === "transition-task") {
        calls.push(cmd.transition.kind);
        if (cmd.transition.kind === "update-run") {
          throw new DomainError("version_conflict", "conflict", { taskId: "task-1" });
        }
      }
      return makeCommandResult();
    });

    const assistantEvent: ProviderEvent = { kind: "assistant_text", text: "hi" };
    const finalEvent: ProviderEvent = { kind: "final", sessionRef: "ref-x" };
    const chunks = makeChunks(["line-1", "line-2"], 0);

    const orchestrator = makeOrchestrator([[assistantEvent], [finalEvent]], chunks, applyCommand);
    await orchestrator.run();

    expect(calls).toEqual(["update-run", "complete-runtime"]);
  });

  it("stale session: session_mismatch on complete-runtime → exits silently without rethrowing", async () => {
    const calls: string[] = [];
    const applyCommand = vi.fn(async (cmd: Command): Promise<CommandResult> => {
      if (cmd.kind === "transition-task") {
        calls.push(cmd.transition.kind);
        if (cmd.transition.kind === "complete-runtime") {
          throw new DomainError("session_mismatch", "task session does not match", { taskId: "task-1" });
        }
      }
      return makeCommandResult();
    });

    const finalEvent: ProviderEvent = { kind: "final", sessionRef: "ref-x" };
    const chunks = makeChunks(["line-1"], 0);

    const orchestrator = makeOrchestrator([[finalEvent]], chunks, applyCommand);
    await expect(orchestrator.run()).resolves.toBeUndefined();
    expect(calls).toContain("complete-runtime");
    expect(calls).not.toContain("mark-interrupted");
  });

  it("provider error{recoverable:false} then final → update-run then mark-interrupted, not complete-runtime", async () => {
    const calls: string[] = [];
    const applyCommand = vi.fn(async (cmd: Command): Promise<CommandResult> => {
      if (cmd.kind === "transition-task") calls.push(cmd.transition.kind);
      return makeCommandResult();
    });

    const errorEvent: ProviderEvent = { kind: "error", recoverable: false, message: "turn failed" };
    const finalEvent: ProviderEvent = { kind: "final", sessionRef: "ref-x" };
    const chunks = makeChunks(["line-1", "line-2"], 0);

    const orchestrator = makeOrchestrator([[errorEvent], [finalEvent]], chunks, applyCommand);
    await orchestrator.run();

    expect(calls).toEqual(["update-run", "mark-interrupted"]);
    expect(calls).not.toContain("complete-runtime");
  });
});
