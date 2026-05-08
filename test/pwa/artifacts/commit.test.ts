import { describe, it, expect } from "vitest";
import { render } from "../../../pwa/assets/artifacts/commit.js";

describe("commit renderer", () => {
  it("renders short SHA (first 8 chars)", () => {
    const artifact = { kind: "commit" as const, ref: "abcdef1234567890", producedBy: "t1", createdAt: "2026-01-01T00:00:00Z" };
    const el = render(artifact);
    expect(el.textContent).toBe("abcdef12");
    expect(el.className).toContain("artifact-commit");
  });

  it("handles short SHA gracefully", () => {
    const artifact = { kind: "commit" as const, ref: "abc", producedBy: "t1", createdAt: "2026-01-01T00:00:00Z" };
    const el = render(artifact);
    expect(el.textContent).toBe("abc");
  });
});
