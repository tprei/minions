import { describe, it, expect, beforeEach, vi } from "vitest";
import { createWorkspaceShell } from "../../pwa/assets/views/workspace-shell.js";

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}")));
});

describe("createWorkspaceShell", () => {
  it("renders 7 phase containers, all initially hidden", () => {
    const { element } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    const phases = ["input", "transcript", "progress", "diff", "summary", "error", "operator"];
    for (const p of phases) {
      const el = element.querySelector(`.phase-${p}`) as HTMLElement;
      expect(el, `phase-${p} missing`).not.toBeNull();
      expect(el.style.display, `phase-${p} should be hidden`).toBe("none");
    }
  });

  it("setExecutionStatus(pending) shows phase-input", () => {
    const { element, setExecutionStatus } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    setExecutionStatus("pending");
    const input = element.querySelector(".phase-input") as HTMLElement;
    expect(input.style.display).not.toBe("none");
  });

  it("setExecutionStatus(ready) shows phase-input", () => {
    const { element, setExecutionStatus } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    setExecutionStatus("ready");
    const input = element.querySelector(".phase-input") as HTMLElement;
    expect(input.style.display).not.toBe("none");
  });

  it("setExecutionStatus(running) shows phase-transcript, others hidden", () => {
    const { element, setExecutionStatus } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    setExecutionStatus("running");
    const transcript = element.querySelector(".phase-transcript") as HTMLElement;
    expect(transcript.style.display).not.toBe("none");
    const input = element.querySelector(".phase-input") as HTMLElement;
    expect(input.style.display).toBe("none");
  });

  it("setExecutionStatus(quality-pending) shows phase-progress", () => {
    const { element, setExecutionStatus } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    setExecutionStatus("quality-pending");
    const progress = element.querySelector(".phase-progress") as HTMLElement;
    expect(progress.style.display).not.toBe("none");
  });

  it("setExecutionStatus(finalizing) shows phase-diff", () => {
    const { element, setExecutionStatus } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    setExecutionStatus("finalizing");
    const diff = element.querySelector(".phase-diff") as HTMLElement;
    expect(diff.style.display).not.toBe("none");
  });

  it("setExecutionStatus(merged) shows phase-summary", () => {
    const { element, setExecutionStatus } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    setExecutionStatus("merged");
    const summary = element.querySelector(".phase-summary") as HTMLElement;
    expect(summary.style.display).not.toBe("none");
  });

  it("setExecutionStatus(failed) shows phase-error", () => {
    const { element, setExecutionStatus } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    setExecutionStatus("failed");
    const error = element.querySelector(".phase-error") as HTMLElement;
    expect(error.style.display).not.toBe("none");
  });

  it("setExecutionStatus(needs-review) shows phase-operator", () => {
    const { element, setExecutionStatus } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    setExecutionStatus("needs-review");
    const operator = element.querySelector(".phase-operator") as HTMLElement;
    expect(operator.style.display).not.toBe("none");
  });

  it("only one phase is visible at a time", () => {
    const { element, setExecutionStatus } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    setExecutionStatus("running");
    const phases = ["input", "transcript", "progress", "diff", "summary", "error", "operator"];
    const visible = phases.filter((p) => {
      const el = element.querySelector(`.phase-${p}`) as HTMLElement;
      return el.style.display !== "none";
    });
    expect(visible).toEqual(["transcript"]);
  });

  it("transcript node is in DOM across phase transitions (hidden-not-unmounted)", () => {
    const { element, setExecutionStatus, appendTranscriptEvent } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    setExecutionStatus("running");
    appendTranscriptEvent({ providerEvent: { kind: "assistant_text", text: "hello" } });

    setExecutionStatus("quality-pending");
    const transcript = element.querySelector(".transcript");
    expect(transcript, "transcript scroller removed from DOM").not.toBeNull();
    expect(transcript!.textContent).toContain("hello");

    setExecutionStatus("running");
    const transcriptAgain = element.querySelector(".transcript");
    expect(transcriptAgain).not.toBeNull();
    expect(transcriptAgain!.textContent).toContain("hello");
  });

  it("progress phase shows correct caption for quality-pending", () => {
    const { element, setExecutionStatus } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    setExecutionStatus("quality-pending");
    const caption = element.querySelector(".phase-progress-caption") as HTMLElement;
    expect(caption.textContent).toBe("Running quality gates");
  });

  it("progress phase shows correct caption for ci-pending", () => {
    const { element, setExecutionStatus } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    setExecutionStatus("ci-pending");
    const caption = element.querySelector(".phase-progress-caption") as HTMLElement;
    expect(caption.textContent).toBe("CI running");
  });

  it("destroy removes element from DOM", () => {
    const { element, destroy, setExecutionStatus } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    document.body.appendChild(element);
    setExecutionStatus("pending");
    destroy();
    expect(document.body.contains(element)).toBe(false);
  });

  it("setExecutionStatus throws on unknown status", () => {
    const { setExecutionStatus } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    expect(() => setExecutionStatus("bogus-status")).toThrow("unknown executionStatus: bogus-status");
  });

  it("error phase has no retry or reset buttons", () => {
    const { element, setExecutionStatus } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    setExecutionStatus("failed");
    expect(element.querySelector(".phase-error-retry-btn")).toBeNull();
    expect(element.querySelector(".phase-error-reset-btn")).toBeNull();
    expect(element.querySelector(".phase-error-recovery-caption")).not.toBeNull();
  });

  it("setArtifacts sets href on PR link when merged", () => {
    const { element, setExecutionStatus, setArtifacts } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    setExecutionStatus("merged");
    setArtifacts([{ kind: "pr", url: "https://github.com/org/repo/pull/1" }]);
    const link = element.querySelector(".phase-summary-pr-link") as HTMLAnchorElement;
    expect(link.href).toContain("https://github.com/org/repo/pull/1");
  });

  it("setArtifacts uses the last pr artifact", () => {
    const { element, setExecutionStatus, setArtifacts } = createWorkspaceShell({ workflowId: "wf1", taskId: "t1", eventBus: null });
    setExecutionStatus("merged");
    setArtifacts([
      { kind: "pr", url: "https://github.com/org/repo/pull/1" },
      { kind: "diff", url: "https://example.com/diff" },
      { kind: "pr", url: "https://github.com/org/repo/pull/2" },
    ]);
    const link = element.querySelector(".phase-summary-pr-link") as HTMLAnchorElement;
    expect(link.href).toContain("https://github.com/org/repo/pull/2");
  });
});
