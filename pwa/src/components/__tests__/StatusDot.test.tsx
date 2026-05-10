import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { StatusDot } from "../StatusDot";

describe("StatusDot agent color", () => {
  afterEach(cleanup);

  it("renders no ring class when agentColor is omitted", () => {
    const { container } = render(<StatusDot status="running" />);
    const dot = container.querySelector("span");
    expect(dot).not.toBeNull();
    expect(dot!.className).not.toContain("ring-");
  });

  it("renders blue ring for blue agentColor (claude-code)", () => {
    const { container } = render(<StatusDot status="running" agentColor="blue" />);
    const dot = container.querySelector("span");
    expect(dot!.className).toContain("ring-1");
    expect(dot!.className).toContain("ring-blue-400");
  });

  it("renders purple ring for purple agentColor (codex)", () => {
    const { container } = render(<StatusDot status="running" agentColor="purple" />);
    const dot = container.querySelector("span");
    expect(dot!.className).toContain("ring-purple-400");
  });

  it("renders grey ring for grey agentColor (stub)", () => {
    const { container } = render(<StatusDot status="running" agentColor="grey" />);
    const dot = container.querySelector("span");
    expect(dot!.className).toContain("ring-fg-subtle");
  });
});
