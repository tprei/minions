import { describe, expect, it } from "vitest";
import { CodexProvider } from "../../../src/plugins/providers/codex.js";
import type { ProviderEvent } from "../../../src/plugins/provider-plugin.js";

function encode(obj: unknown): string {
  return JSON.stringify(obj);
}

describe("CodexProvider", () => {
  it("capability vector has correct literal shape", () => {
    const provider = new CodexProvider();
    expect(provider.capabilities).toEqual({
      resume: true,
      mcp: true,
      structuredOutput: false,
      oauthLogin: true,
      streamJson: true,
      sessionRefFormat: "opaque",
    });
  });

  it("standard fixture: thread.started → turn.started → item agent_message → item command_execution → turn.completed", () => {
    const provider = new CodexProvider();

    expect(provider.parseFrame(encode({ type: "thread.started", thread_id: "thread-xyz" }))).toEqual([]);
    expect(provider.parseFrame(encode({ type: "turn.started" }))).toEqual([]);

    const startedMsg = provider.parseFrame(
      encode({ type: "item.started", item: { type: "agent_message", id: "msg-1" } }),
    );
    expect(startedMsg).toEqual([]);

    const completedMsg = provider.parseFrame(
      encode({
        type: "item.completed",
        item: {
          type: "agent_message",
          id: "msg-1",
          text: "Hi there!",
        },
      }),
    );
    expect(completedMsg).toEqual([{ kind: "assistant_text", text: "Hi there!" }]);

    const startedCmd = provider.parseFrame(
      encode({
        type: "item.started",
        item: { type: "command_execution", id: "cmd-1", command: ["ls"] },
      }),
    );
    expect(startedCmd).toHaveLength(1);
    expect(startedCmd[0]).toMatchObject({ kind: "tool_call", id: "cmd-1", name: "command_execution" });

    const completedCmd = provider.parseFrame(
      encode({
        type: "item.completed",
        item: { type: "command_execution", id: "cmd-1", aggregated_output: "file1\nfile2\n", status: "completed" },
      }),
    );
    expect(completedCmd).toEqual([
      { kind: "tool_result", id: "cmd-1", output: "file1\nfile2\n", isError: false },
    ]);

    const turnCompleted = provider.parseFrame(
      encode({
        type: "turn.completed",
        turn_id: "t-1",
        usage: { input_tokens: 5, output_tokens: 10 },
      }),
    );
    expect(turnCompleted).toHaveLength(2);
    expect(turnCompleted[0]).toMatchObject({ kind: "usage", inputTokens: 5, outputTokens: 10 });
    expect(turnCompleted[1]).toMatchObject({ kind: "final", sessionRef: "thread-xyz" });
  });

  it("lastThreadId captured from thread.started and used in final.sessionRef", () => {
    const provider = new CodexProvider();
    provider.parseFrame(encode({ type: "thread.started", thread_id: "my-thread-id" }));
    const events = provider.parseFrame(
      encode({ type: "turn.completed", usage: { input_tokens: 0, output_tokens: 0 } }),
    );
    const finalEvent = events.find((e) => e.kind === "final") as ProviderEvent & { kind: "final" };
    expect(finalEvent?.sessionRef).toBe("my-thread-id");
  });

  it("turn.failed emits non-recoverable error", () => {
    const provider = new CodexProvider();
    const events = provider.parseFrame(
      encode({ type: "turn.failed", error: { message: "context window exceeded" } }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ kind: "error", recoverable: false, message: "context window exceeded" });
  });

  it("item-level error emits recoverable error", () => {
    const provider = new CodexProvider();
    const events = provider.parseFrame(
      encode({ type: "item.completed", item: { type: "error", message: "tool crashed" } }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ kind: "error", recoverable: true, message: "tool crashed" });
  });

  it("reasoning item emits thinking event on completed", () => {
    const provider = new CodexProvider();
    expect(
      provider.parseFrame(encode({ type: "item.started", item: { type: "reasoning", id: "r-1" } })),
    ).toEqual([]);
    const events = provider.parseFrame(
      encode({
        type: "item.completed",
        item: {
          type: "reasoning",
          id: "r-1",
          text: "I reasoned about it",
        },
      }),
    );
    expect(events).toEqual([{ kind: "thinking", text: "I reasoned about it" }]);
  });

  it("item.updated returns empty array", () => {
    const provider = new CodexProvider();
    expect(provider.parseFrame(encode({ type: "item.updated", item: { id: "x" } }))).toEqual([]);
  });

  it("turn.completed maps cached_input_tokens and reasoning_output_tokens", () => {
    const provider = new CodexProvider();
    const events = provider.parseFrame(
      encode({
        type: "turn.completed",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cached_input_tokens: 40,
          reasoning_output_tokens: 10,
        },
      }),
    );
    const usageEvent = events.find((e) => e.kind === "usage") as ProviderEvent & { kind: "usage" };
    expect(usageEvent?.cachedInputTokens).toBe(40);
    expect(usageEvent?.reasoningTokens).toBe(10);
  });

  it("mcp_tool_call completed uses result field", () => {
    const provider = new CodexProvider();
    const result = { content: [{ type: "text", text: "tool output" }], structured_content: null };
    const events = provider.parseFrame(
      encode({
        type: "item.completed",
        item: { type: "mcp_tool_call", id: "mcp-1", server: "fs", tool: "read", arguments: {}, result, status: "completed" },
      }),
    );
    expect(events).toEqual([{ kind: "tool_result", id: "mcp-1", output: result, isError: false }]);
  });

  it("file_change completed uses changes field", () => {
    const provider = new CodexProvider();
    const changes = [{ path: "/tmp/foo.ts", kind: "add" }];
    const events = provider.parseFrame(
      encode({
        type: "item.completed",
        item: { type: "file_change", id: "fc-1", changes, status: "completed" },
      }),
    );
    expect(events).toEqual([{ kind: "tool_result", id: "fc-1", output: changes, isError: false }]);
  });

  it("web_search completed uses query field", () => {
    const provider = new CodexProvider();
    const events = provider.parseFrame(
      encode({
        type: "item.completed",
        item: { type: "web_search", id: "ws-1", query: "openai codex" },
      }),
    );
    expect(events).toEqual([{ kind: "tool_result", id: "ws-1", output: "openai codex", isError: false }]);
  });

  it("top-level error event emits non-recoverable error", () => {
    const provider = new CodexProvider();
    const events = provider.parseFrame(encode({ type: "error", message: "fatal error" }));
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ kind: "error", recoverable: false, message: "fatal error" });
  });

  it("unknown type emits loud non-recoverable error", () => {
    const provider = new CodexProvider();
    const events = provider.parseFrame(encode({ type: "future.event", data: {} }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "error", recoverable: false });
    expect((events[0] as ProviderEvent & { kind: "error" }).message).toContain("future.event");
  });

  it("empty line returns empty array", () => {
    const provider = new CodexProvider();
    expect(provider.parseFrame("")).toEqual([]);
    expect(provider.parseFrame("  ")).toEqual([]);
  });

  it("malformed JSON throws", () => {
    const provider = new CodexProvider();
    expect(() => provider.parseFrame("{bad}")).toThrow("malformed JSON line");
  });
});
