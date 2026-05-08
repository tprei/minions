import { describe, it, expect } from "vitest";
import { render } from "../../../pwa/assets/artifacts/quality-report.js";

describe("quality-report renderer", () => {
  it("renders overallStatus pill", () => {
    const ref = JSON.stringify({
      overallStatus: "pass",
      checks: [{ name: "lint", status: "pass" }, { name: "tests", status: "pass" }],
      ranAt: "2026-01-01T00:00:00Z",
    });
    const artifact = { kind: "quality-report" as const, ref, producedBy: "t1", createdAt: "2026-01-01T00:00:00Z" };
    const el = render(artifact);
    expect(el.className).toContain("artifact-quality-report");
    const pill = el.querySelector(".quality-status-pill") as HTMLElement;
    expect(pill.textContent).toBe("pass");
    expect(pill.className).toContain("quality-status-pass");
  });

  it("renders per-check rows", () => {
    const ref = JSON.stringify({
      overallStatus: "fail",
      checks: [
        { name: "lint", status: "fail" },
        { name: "tests", status: "pass" },
      ],
      ranAt: "2026-01-01T00:00:00Z",
    });
    const artifact = { kind: "quality-report" as const, ref, producedBy: "t1", createdAt: "2026-01-01T00:00:00Z" };
    const el = render(artifact);
    const rows = el.querySelectorAll(".quality-checks-table tr");
    expect(rows.length).toBe(2);
  });

  it("throws on invalid JSON ref", () => {
    const artifact = { kind: "quality-report" as const, ref: "{bad}", producedBy: "t1", createdAt: "2026-01-01T00:00:00Z" };
    expect(() => render(artifact)).toThrow("quality-report");
  });

  it("throws when ref JSON is not an object", () => {
    const artifact = { kind: "quality-report" as const, ref: "42", producedBy: "t1", createdAt: "2026-01-01T00:00:00Z" };
    expect(() => render(artifact)).toThrow("quality-report");
  });
});
