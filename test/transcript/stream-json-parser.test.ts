import { describe, it, expect } from "vitest";
import { parseFrame } from "../../src/transcript/stream-json-parser.js";

describe("parseFrame", () => {
  it("returns [] for empty line", () => {
    expect(parseFrame("")).toEqual([]);
    expect(parseFrame("   ")).toEqual([]);
  });

  it("returns [] for non-JSON line", () => {
    expect(parseFrame("not json")).toEqual([]);
    expect(parseFrame("stderr noise")).toEqual([]);
  });

  it("parses assistant_text", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "hello" }] },
    });
    const result = parseFrame(line);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ kind: "assistant_text", text: "hello" });
  });

  it("parses thinking", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "thinking", thinking: "hmm" }] },
    });
    const result = parseFrame(line);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ kind: "thinking", text: "hmm" });
  });

  it("parses tool_call", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "tool_use", id: "tc-1", name: "bash", input: { cmd: "ls" } }] },
    });
    const result = parseFrame(line);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ kind: "tool_call", id: "tc-1", name: "bash", input: { cmd: "ls" } });
  });

  it("parses tool_result", () => {
    const line = JSON.stringify({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "tc-1", content: "file.txt", is_error: false }] },
    });
    const result = parseFrame(line);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ kind: "tool_result", id: "tc-1", output: "file.txt", isError: false });
  });

  it("parses result line into usage + final", () => {
    const line = JSON.stringify({
      type: "result",
      subtype: "success",
      session_id: "sess-abc",
      usage: { input_tokens: 100, output_tokens: 50 },
      total_cost_usd: 0.01,
      duration_ms: 2000,
      num_turns: 3,
    });
    const result = parseFrame(line);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ kind: "usage", inputTokens: 100, outputTokens: 50, costUsd: 0.01 });
    expect(result[1]).toMatchObject({ kind: "final", sessionRef: "sess-abc" });
  });

  it("parses error result subtype into error + usage + final", () => {
    const line = JSON.stringify({
      type: "result",
      subtype: "error_during_execution",
      session_id: "sess-err",
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const result = parseFrame(line);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ kind: "error", recoverable: false });
    expect(result[1]).toMatchObject({ kind: "usage" });
    expect(result[2]).toMatchObject({ kind: "final" });
  });

  it("returns [] for stream_event and rate_limit_event", () => {
    expect(parseFrame(JSON.stringify({ type: "stream_event" }))).toEqual([]);
    expect(parseFrame(JSON.stringify({ type: "rate_limit_event" }))).toEqual([]);
  });

  it("returns error event for unknown type", () => {
    const line = JSON.stringify({ type: "something_new" });
    const result = parseFrame(line);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "error", recoverable: false });
  });

  it("parses api_retry system event as recoverable error", () => {
    const line = JSON.stringify({ type: "system", subtype: "api_retry", message: "retrying" });
    const result = parseFrame(line);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "error", recoverable: true, source: "api_retry" });
  });

  it("returns [] for non-api_retry system event", () => {
    const line = JSON.stringify({ type: "system", subtype: "something_else" });
    expect(parseFrame(line)).toEqual([]);
  });
});
