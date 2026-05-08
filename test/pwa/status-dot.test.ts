import { describe, it, expect } from "vitest";
import { createStatusDot } from "../../pwa/assets/components/status-dot.js";

const VALID_STATUSES = [
  "pending", "ready", "running", "completed", "quality-pending",
  "finalizing", "pr-open", "ci-pending", "needs-review", "merged",
  "failed", "cancelled",
];

describe("createStatusDot", () => {
  it.each(VALID_STATUSES)("renders %s status dot", (status) => {
    const dot = createStatusDot(status);
    expect(dot.className).toContain(`status-dot-${status}`);
    expect(dot.getAttribute("aria-label")).toBe(status);
  });

  it("throws on unknown status", () => {
    expect(() => createStatusDot("not-a-real-status")).toThrow(
      "unknown executionStatus: not-a-real-status"
    );
  });

  it("adds busy class when busy option is true", () => {
    const dot = createStatusDot("running", { busy: true });
    expect(dot.className).toContain("status-dot-busy");
  });

  it("applies sm size class", () => {
    const dot = createStatusDot("pending", { size: "sm" });
    expect(dot.className).toContain("sm");
  });
});
