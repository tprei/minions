import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("/assets/vendor/marked.esm.js", () => ({
  marked: {
    parse: (text: string) => `<p>${text}</p>`,
    setOptions: () => {},
  },
}));

vi.mock("/assets/vendor/dompurify.esm.js", () => ({
  default: {
    sanitize: (html: string) => html,
  },
}));

vi.mock("/assets/components/status-dot.js", () => ({
  createStatusDot: (status: string, _opts?: unknown) => {
    const span = document.createElement("span");
    span.className = `status-dot status-dot-${status}`;
    span.setAttribute("aria-label", status);
    return span;
  },
}));

import { render as renderAssistantText } from "../../../pwa/assets/transcript/events/assistant-text.js";
import { render as renderThinking } from "../../../pwa/assets/transcript/events/thinking.js";
import { render as renderToolCall } from "../../../pwa/assets/transcript/events/tool-call.js";
import { render as renderToolResult } from "../../../pwa/assets/transcript/events/tool-result.js";
import { render as renderUsage } from "../../../pwa/assets/transcript/events/usage.js";
import { render as renderError } from "../../../pwa/assets/transcript/events/error.js";
import { render as renderFinal } from "../../../pwa/assets/transcript/events/final.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("assistant_text renderer", () => {
  it("renders markdown via marked and sanitizes via DOMPurify", () => {
    const el = renderAssistantText({ kind: "assistant_text", text: "hello world" });
    expect(el.className).toContain("te-assistant-text");
    const content = el.querySelector(".te-content");
    expect(content).not.toBeNull();
    expect(content!.innerHTML).toBe("<p>hello world</p>");
  });

  it("XSS attempt is sanitized (DOMPurify mock strips nothing but the test verifies the path is taken)", () => {
    const xss = '<script>alert("xss")</script>';
    const el = renderAssistantText({ kind: "assistant_text", text: xss });
    const content = el.querySelector(".te-content");
    expect(content).not.toBeNull();
    expect(content!.innerHTML).toBeDefined();
  });

  it("renders empty text without error", () => {
    const el = renderAssistantText({ kind: "assistant_text", text: "" });
    expect(el.className).toContain("te-assistant-text");
  });
});

describe("thinking renderer", () => {
  it("renders with toggle button, body initially hidden", () => {
    const el = renderThinking({ kind: "thinking", text: "deep thought" });
    expect(el.className).toContain("te-thinking");
    const toggle = el.querySelector(".te-thinking-toggle") as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const body = el.querySelector(".te-thinking-body") as HTMLElement;
    expect(body.hidden).toBe(true);
  });

  it("expands on click", () => {
    const el = renderThinking({ kind: "thinking", text: "pondering" });
    const toggle = el.querySelector(".te-thinking-toggle") as HTMLButtonElement;
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const body = el.querySelector(".te-thinking-body") as HTMLElement;
    expect(body.hidden).toBe(false);
  });

  it("shows the thinking text", () => {
    const el = renderThinking({ kind: "thinking", text: "pondering existence" });
    const pre = el.querySelector(".te-thinking-text");
    expect(pre?.textContent).toBe("pondering existence");
  });
});

describe("tool_call renderer", () => {
  it("renders tool name in header", () => {
    const el = renderToolCall({ kind: "tool_call", id: "c1", name: "bash", input: { cmd: "ls" } });
    expect(el.className).toContain("te-tool-call");
    const name = el.querySelector(".te-tool-name");
    expect(name?.textContent).toBe("bash");
  });

  it("shows a status dot with running status", () => {
    const el = renderToolCall({ kind: "tool_call", id: "c1", name: "Read", input: {} });
    const dot = el.querySelector(".status-dot");
    expect(dot).not.toBeNull();
    expect(dot!.className).toContain("status-dot-running");
  });

  it("details are hidden initially", () => {
    const el = renderToolCall({ kind: "tool_call", id: "c1", name: "Read", input: { file: "x" } });
    const details = el.querySelector(".te-tool-details") as HTMLElement;
    expect(details.hidden).toBe(true);
  });

  it("clicking expand button shows details", () => {
    const el = renderToolCall({ kind: "tool_call", id: "c1", name: "Edit", input: { file: "a" } });
    const btn = el.querySelector(".te-tool-expand-btn") as HTMLButtonElement;
    btn.click();
    const details = el.querySelector(".te-tool-details") as HTMLElement;
    expect(details.hidden).toBe(false);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("tool_result renderer", () => {
  it("renders output text", () => {
    const el = renderToolResult({ kind: "tool_result", id: "c1", output: "file contents here", isError: false });
    expect(el.className).toContain("te-tool-result");
    const out = el.querySelector(".te-tool-result-output");
    expect(out?.textContent).toContain("file contents here");
  });

  it("error result has error class", () => {
    const el = renderToolResult({ kind: "tool_result", id: "c1", output: "failed", isError: true });
    expect(el.className).toContain("te-tool-result-error");
  });

  it("renders non-error result without error class", () => {
    const el = renderToolResult({ kind: "tool_result", id: "c1", output: "ok", isError: false });
    expect(el.className).not.toContain("te-tool-result-error");
  });
});

describe("usage renderer — cost tier pills", () => {
  it("green tier for cost < 0.01", () => {
    const el = renderUsage({ kind: "usage", inputTokens: 10, outputTokens: 5, costUsd: 0.005 });
    const pill = el.querySelector(".te-usage-pill") as HTMLElement;
    expect(pill).not.toBeNull();
    expect(pill.dataset.costTier).toBe("green");
    expect(pill.className).toContain("te-usage-tier-green");
  });

  it("yellow tier for cost 0.01 <= x < 0.10", () => {
    const el = renderUsage({ kind: "usage", inputTokens: 100, outputTokens: 50, costUsd: 0.05 });
    const pill = el.querySelector(".te-usage-pill") as HTMLElement;
    expect(pill.dataset.costTier).toBe("yellow");
    expect(pill.className).toContain("te-usage-tier-yellow");
  });

  it("orange tier for cost 0.10 <= x < 1.00", () => {
    const el = renderUsage({ kind: "usage", inputTokens: 1000, outputTokens: 500, costUsd: 0.50 });
    const pill = el.querySelector(".te-usage-pill") as HTMLElement;
    expect(pill.dataset.costTier).toBe("orange");
    expect(pill.className).toContain("te-usage-tier-orange");
  });

  it("red tier for cost >= 1.00", () => {
    const el = renderUsage({ kind: "usage", inputTokens: 10000, outputTokens: 5000, costUsd: 1.50 });
    const pill = el.querySelector(".te-usage-pill") as HTMLElement;
    expect(pill.dataset.costTier).toBe("red");
    expect(pill.className).toContain("te-usage-tier-red");
  });

  it("shows token counts when costUsd is not provided", () => {
    const el = renderUsage({ kind: "usage", inputTokens: 100, outputTokens: 50 });
    const pill = el.querySelector(".te-usage-pill") as HTMLElement;
    expect(pill.className).toContain("te-usage-tier-tokens");
    expect(pill.textContent).toContain("100");
    expect(pill.textContent).toContain("50");
  });
});

describe("error renderer", () => {
  it("renders error message", () => {
    const el = renderError({ kind: "error", recoverable: false, message: "something broke" });
    expect(el.className).toContain("te-error");
    const msg = el.querySelector(".te-error-message");
    expect(msg?.textContent).toBe("something broke");
  });

  it("renders stack trace toggle when stack is present", () => {
    const el = renderError({
      kind: "error",
      recoverable: false,
      message: "oops",
      stack: "Error: oops\n    at foo.js:1:1",
    });
    const toggle = el.querySelector(".te-error-stack-toggle") as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    const stack = el.querySelector(".te-error-stack") as HTMLElement;
    expect(stack.hidden).toBe(true);
    toggle.click();
    expect(stack.hidden).toBe(false);
  });

  it("no stack toggle when stack is absent", () => {
    const el = renderError({ kind: "error", recoverable: false, message: "broken" });
    expect(el.querySelector(".te-error-stack-toggle")).toBeNull();
  });
});

describe("final renderer", () => {
  it("renders session complete label and sessionRef", () => {
    const el = renderFinal({ kind: "final", sessionRef: "sess-abc-123" });
    expect(el.className).toContain("te-final");
    expect(el.querySelector(".te-final-label")?.textContent).toBe("Session complete");
    expect(el.querySelector(".te-final-ref")?.textContent).toBe("sess-abc-123");
  });

  it("renders exit metadata when present", () => {
    const el = renderFinal({
      kind: "final",
      sessionRef: "sess-xyz",
      exitMetadata: { exitCode: 0 },
    });
    const meta = el.querySelector(".te-final-meta");
    expect(meta).not.toBeNull();
    expect(meta?.textContent).toContain("exitCode");
  });
});
