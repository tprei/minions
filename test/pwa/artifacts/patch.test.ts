import { describe, it, expect } from "vitest";
import { render } from "../../../pwa/assets/artifacts/patch.js";

describe("patch renderer", () => {
  const PATCH = `--- a/file.ts\n+++ b/file.ts\n@@ -1,2 +1,3 @@\n-old line\n+new line\n context`;

  it("renders a collapsible patch with toggle button", () => {
    const artifact = { kind: "patch" as const, ref: PATCH, producedBy: "t1", createdAt: "2026-01-01T00:00:00Z" };
    const el = render(artifact);
    expect(el.className).toContain("artifact-patch");
    const toggle = el.querySelector(".artifact-patch-toggle");
    expect(toggle).not.toBeNull();
  });

  it("pre block is hidden by default", () => {
    const artifact = { kind: "patch" as const, ref: PATCH, producedBy: "t1", createdAt: "2026-01-01T00:00:00Z" };
    const el = render(artifact);
    const pre = el.querySelector(".artifact-patch-pre") as HTMLElement;
    expect(pre.style.display).toBe("none");
  });

  it("toggle click expands the diff", () => {
    const artifact = { kind: "patch" as const, ref: PATCH, producedBy: "t1", createdAt: "2026-01-01T00:00:00Z" };
    const el = render(artifact);
    document.body.appendChild(el);
    const toggle = el.querySelector(".artifact-patch-toggle") as HTMLButtonElement;
    toggle.click();
    const pre = el.querySelector(".artifact-patch-pre") as HTMLElement;
    expect(pre.style.display).toBe("block");
    document.body.removeChild(el);
  });

  it("added lines get patch-add class", () => {
    const artifact = { kind: "patch" as const, ref: PATCH, producedBy: "t1", createdAt: "2026-01-01T00:00:00Z" };
    const el = render(artifact);
    const addLines = el.querySelectorAll(".patch-add");
    expect(addLines.length).toBeGreaterThan(0);
  });

  it("removed lines get patch-del class", () => {
    const artifact = { kind: "patch" as const, ref: PATCH, producedBy: "t1", createdAt: "2026-01-01T00:00:00Z" };
    const el = render(artifact);
    const delLines = el.querySelectorAll(".patch-del");
    expect(delLines.length).toBeGreaterThan(0);
  });
});
