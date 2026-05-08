import { describe, it, expect } from "vitest";
import { render } from "../../../pwa/assets/artifacts/ci-report.js";

describe("ci-report renderer", () => {
  it("renders PR link and head SHA", () => {
    const ref = JSON.stringify({
      prNumber: 42,
      prUrl: "https://github.com/org/repo/pull/42",
      headSha: "abcdef1234567890",
      failed: [],
      at: "2026-01-01T00:00:00Z",
    });
    const artifact = { kind: "ci-report" as const, ref, producedBy: "t1", createdAt: "2026-01-01T00:00:00Z" };
    const el = render(artifact);
    expect(el.className).toContain("artifact-ci-report");
    const link = el.querySelector(".ci-pr-link") as HTMLAnchorElement;
    expect(link.textContent).toContain("42");
    const sha = el.querySelector(".ci-head-sha") as HTMLElement;
    expect(sha.textContent).toContain("abcdef12");
  });

  it("renders failed checks list", () => {
    const ref = JSON.stringify({
      prNumber: 1,
      prUrl: "https://github.com/org/repo/pull/1",
      headSha: "deadbeef",
      failed: [
        { name: "lint", conclusion: "failure" },
        { name: "test", conclusion: "failure" },
      ],
      at: "2026-01-01T00:00:00Z",
    });
    const artifact = { kind: "ci-report" as const, ref, producedBy: "t1", createdAt: "2026-01-01T00:00:00Z" };
    const el = render(artifact);
    const items = el.querySelectorAll(".ci-failed-item");
    expect(items.length).toBe(2);
    expect(items[0]?.textContent).toContain("lint");
  });

  it("shows all-green message when no failed checks", () => {
    const ref = JSON.stringify({
      prNumber: 1,
      prUrl: "https://github.com/org/repo/pull/1",
      headSha: "aaa",
      failed: [],
      at: "2026-01-01T00:00:00Z",
    });
    const artifact = { kind: "ci-report" as const, ref, producedBy: "t1", createdAt: "2026-01-01T00:00:00Z" };
    const el = render(artifact);
    const ok = el.querySelector(".ci-all-green");
    expect(ok).not.toBeNull();
  });

  it("throws on invalid JSON ref", () => {
    const artifact = { kind: "ci-report" as const, ref: "not-json", producedBy: "t1", createdAt: "2026-01-01T00:00:00Z" };
    expect(() => render(artifact)).toThrow("ci-report");
  });

  it("throws when ref JSON is not an object", () => {
    const artifact = { kind: "ci-report" as const, ref: '"string"', producedBy: "t1", createdAt: "2026-01-01T00:00:00Z" };
    expect(() => render(artifact)).toThrow("ci-report");
  });
});
