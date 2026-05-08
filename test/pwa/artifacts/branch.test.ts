import { describe, it, expect } from "vitest";
import { render } from "../../../pwa/assets/artifacts/branch.js";

describe("branch renderer", () => {
  it("renders a chip with the branch ref", () => {
    const artifact = { kind: "branch" as const, ref: "feat/my-feature", producedBy: "t1", createdAt: "2026-01-01T00:00:00Z" };
    const el = render(artifact);
    expect(el.tagName.toLowerCase()).toBe("span");
    expect(el.textContent).toContain("feat/my-feature");
    expect(el.className).toContain("artifact-branch");
  });
});
