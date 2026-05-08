import { describe, it, expect } from "vitest";
import { cityAlias } from "../../../pwa/assets/utils/city-alias.js";

describe("cityAlias", () => {
  it("returns the same alias for the same workflowId", () => {
    expect(cityAlias("wf-abc123")).toBe(cityAlias("wf-abc123"));
  });

  it("returns different aliases for different workflowIds (high probability)", () => {
    const ids = ["wf-1", "wf-2", "wf-3", "wf-alpha", "wf-beta", "wf-gamma"];
    const aliases = ids.map(cityAlias);
    const unique = new Set(aliases);
    expect(unique.size).toBeGreaterThan(1);
  });

  it("alias matches the format <adjective>-<city>-<3digit>", () => {
    const FORMAT = /^[a-z]+-[a-z]+-\d{3}$/;
    expect(cityAlias("wf-test-1")).toMatch(FORMAT);
    expect(cityAlias("wf-test-2")).toMatch(FORMAT);
    expect(cityAlias("some-other-id")).toMatch(FORMAT);
    expect(cityAlias("")).toMatch(FORMAT);
  });

  it("number part is zero-padded to 3 digits", () => {
    for (let i = 0; i < 20; i++) {
      const alias = cityAlias(`wf-pad-${i}`);
      const parts = alias.split("-");
      const numPart = parts[parts.length - 1] ?? "";
      expect(numPart).toHaveLength(3);
      expect(/^\d{3}$/.test(numPart)).toBe(true);
    }
  });
});
