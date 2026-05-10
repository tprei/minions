import { describe, it, expect } from "vitest";
import { cityAlias, fnv1a32ForTest } from "../cityAlias";

describe("cityAlias", () => {
  it("returns deterministic output for known input A", () => {
    const result = cityAlias("test-session-abc");
    expect(result).toBe(cityAlias("test-session-abc"));
    expect(typeof result).toBe("string");
    expect(result).toMatch(/^[a-z]+-[a-z]+-\d{3}$/);
  });

  it("returns deterministic output for known input B", () => {
    const result = cityAlias("provider-session-12345");
    expect(result).toBe(cityAlias("provider-session-12345"));
    expect(result).toMatch(/^[a-z]+-[a-z]+-\d{3}$/);
  });

  it("returns different aliases for different inputs", () => {
    const a = cityAlias("session-a");
    const b = cityAlias("session-b");
    expect(a).not.toBe(b);
  });

  it("fnv1a32ForTest returns a non-zero uint32 for non-empty string", () => {
    const h = fnv1a32ForTest("hello");
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(2 ** 32);
  });

  it("fnv1a32ForTest is consistent for 'hello'", () => {
    expect(fnv1a32ForTest("hello")).toBe(fnv1a32ForTest("hello"));
  });
});
