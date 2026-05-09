import { describe, it, expect } from "vitest";
import { agentColor } from "../../../pwa/assets/utils/agent-color.js";

describe("agentColor", () => {
  it("returns blue family for claude-code", () => {
    const color = agentColor('claude-code');
    expect(color.hue).toBeGreaterThan(180);
    expect(color.hue).toBeLessThan(260);
    expect(color.accent).toBeTruthy();
  });

  it("returns purple family for codex", () => {
    const color = agentColor('codex');
    expect(color.hue).toBeGreaterThan(250);
    expect(color.hue).toBeLessThanOrEqual(300);
    expect(color.accent).toBeTruthy();
  });

  it("returns grey family for stub", () => {
    const color = agentColor('stub');
    expect(color.hue).toBe(0);
    expect(color.accent).toBeTruthy();
  });

  it("returns fallback for unknown provider", () => {
    const color = agentColor('unknown-provider');
    expect(color).toBeDefined();
    expect(typeof color.hue).toBe('number');
    expect(typeof color.accent).toBe('string');
    expect(typeof color.icon).toBe('string');
  });

  it("claude-code has an icon", () => {
    const color = agentColor('claude-code');
    expect(color.icon).toBeTruthy();
  });

  it("codex has an icon", () => {
    const color = agentColor('codex');
    expect(color.icon).toBeTruthy();
  });

  it("stub has an icon", () => {
    const color = agentColor('stub');
    expect(color.icon).toBeTruthy();
  });

  it("known providers return distinct accents", () => {
    const claudeAccent = agentColor('claude-code').accent;
    const codexAccent = agentColor('codex').accent;
    const stubAccent = agentColor('stub').accent;
    expect(new Set([claudeAccent, codexAccent, stubAccent]).size).toBe(3);
  });
});
