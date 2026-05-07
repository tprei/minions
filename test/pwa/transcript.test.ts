import { describe, it, expect } from "vitest";
import { transcriptNode } from "../../pwa/assets/app-v1.js";

function payload(kind: string, extra: Record<string, unknown> = {}) {
  return { providerEvent: { kind, ...extra } };
}

describe("transcriptNode", () => {
  it("assistant_text → .msg.assistant with text", () => {
    const node = transcriptNode(payload("assistant_text", { text: "hello" }));
    expect(node.className).toBe("msg assistant");
    expect(node.textContent).toBe("hello");
  });

  it("thinking → .msg.thinking with thinking text", () => {
    const node = transcriptNode(payload("thinking", { thinking: "pondering" }));
    expect(node.className).toBe("msg thinking");
    expect(node.textContent).toBe("pondering");
  });

  it("tool_call → .msg.tool-call with name and args", () => {
    const node = transcriptNode(payload("tool_call", { name: "bash", args: { cmd: "ls" } }));
    expect(node.className).toBe("msg tool-call");
    expect(node.textContent).toContain("bash");
  });

  it("tool_result → .msg.tool-result", () => {
    const node = transcriptNode(payload("tool_result", { content: "ok", isError: false }));
    expect(node.className).toBe("msg tool-result");
    expect(node.textContent).toBe("ok");
  });

  it("tool_result with isError → .msg.tool-result.err", () => {
    const node = transcriptNode(payload("tool_result", { content: "fail", isError: true }));
    expect(node.className).toBe("msg tool-result err");
  });

  it("permission_request → .msg.perm", () => {
    const node = transcriptNode(payload("permission_request", { permission: "read_file" }));
    expect(node.className).toBe("msg perm");
    expect(node.textContent).toContain("read_file");
  });

  it("usage → .msg.usage with token counts", () => {
    const node = transcriptNode(payload("usage", { inputTokens: 10, outputTokens: 5 }));
    expect(node.className).toBe("msg usage");
    expect(node.textContent).toContain("10");
    expect(node.textContent).toContain("5");
  });

  it("error → .msg.error with message", () => {
    const node = transcriptNode(payload("error", { message: "something broke" }));
    expect(node.className).toBe("msg error");
    expect(node.textContent).toBe("something broke");
  });

  it("final → .msg.final with result", () => {
    const node = transcriptNode(payload("final", { result: "task complete" }));
    expect(node.className).toBe("msg final");
    expect(node.textContent).toBe("task complete");
  });
});
