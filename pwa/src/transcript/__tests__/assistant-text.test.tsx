import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AssistantText } from "../events/assistant-text";
import { cityAlias } from "../../utils/cityAlias";

describe("AssistantText agent identity badge", () => {
  afterEach(cleanup);

  it("renders no badge when agent identity is missing", () => {
    const { container } = render(<AssistantText text="hello" />);
    expect(container.querySelector("[data-agent-alias]")).toBeNull();
  });

  it("renders the deterministic city-alias badge when both providerType and sessionId are passed", () => {
    const sessionId = "session-xyz-9001";
    const { container } = render(
      <AssistantText
        text="hello"
        agentProviderType="claude-code"
        agentSessionId={sessionId}
      />,
    );
    const badge = container.querySelector("[data-agent-alias]");
    expect(badge).not.toBeNull();
    const expectedAlias = cityAlias(sessionId);
    expect(badge!.getAttribute("data-agent-alias")).toBe(expectedAlias);
    expect(badge!.textContent).toContain(expectedAlias);
  });

  it("renders blue ring for claude-code", () => {
    const { container } = render(
      <AssistantText
        text="hello"
        agentProviderType="claude-code"
        agentSessionId="sess-1"
      />,
    );
    const dot = container.querySelector("[data-agent-alias] span[aria-hidden]");
    expect(dot).not.toBeNull();
    expect(dot!.className).toContain("ring-blue-400");
  });

  it("renders purple ring for codex", () => {
    const { container } = render(
      <AssistantText
        text="hello"
        agentProviderType="codex"
        agentSessionId="sess-2"
      />,
    );
    const dot = container.querySelector("[data-agent-alias] span[aria-hidden]");
    expect(dot!.className).toContain("ring-purple-400");
  });

  it("renders grey ring for unknown provider", () => {
    const { container } = render(
      <AssistantText
        text="hello"
        agentProviderType="some-mystery-provider"
        agentSessionId="sess-3"
      />,
    );
    const dot = container.querySelector("[data-agent-alias] span[aria-hidden]");
    expect(dot!.className).toContain("ring-fg-subtle");
  });
});
