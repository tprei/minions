import { describe, it, expect, beforeEach } from "vitest";
import { createMergeProgress } from "../../../pwa/assets/views/merge-progress.js";

const PHASES = ["prepareMerge", "commit", "squash", "rebase", "applyMerge", "finalize"];

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("createMergeProgress", () => {
  it("renders root element with merge-progress class", () => {
    const { element } = createMergeProgress("T1", null);
    expect(element.className).toContain("merge-progress");
  });

  it("renders 6 steps", () => {
    const { element } = createMergeProgress("T1", null);
    document.body.appendChild(element);

    const steps = element.querySelectorAll(".merge-step");
    expect(steps.length).toBe(6);
  });

  it("renders all 6 phase names as labels", () => {
    const { element } = createMergeProgress("T1", null);
    document.body.appendChild(element);

    const steps = element.querySelectorAll(".merge-step");
    const phases = Array.from(steps).map((s) => s.getAttribute("data-phase"));
    for (const phase of PHASES) {
      expect(phases).toContain(phase);
    }
  });

  it("all steps start in idle state", () => {
    const { element } = createMergeProgress("T1", null);
    document.body.appendChild(element);

    const steps = element.querySelectorAll(".merge-step");
    for (const step of steps) {
      expect(step.classList.contains("merge-step-idle")).toBe(true);
    }
  });

  it("SSE started event transitions step to running", () => {
    const { element, onMergePhase } = createMergeProgress("T1", null);
    document.body.appendChild(element);

    onMergePhase({ payload: { taskId: "T1", phase: "prepareMerge", status: "started" } });

    const step = element.querySelector("[data-phase='prepareMerge']");
    expect(step?.classList.contains("merge-step-running")).toBe(true);
    expect(step?.querySelector(".merge-step-indicator")?.textContent).toBe("◌");
  });

  it("SSE completed event transitions step to completed with checkmark", () => {
    const { element, onMergePhase } = createMergeProgress("T1", null);
    document.body.appendChild(element);

    onMergePhase({ payload: { taskId: "T1", phase: "commit", status: "started" } });
    onMergePhase({ payload: { taskId: "T1", phase: "commit", status: "completed" } });

    const step = element.querySelector("[data-phase='commit']");
    expect(step?.classList.contains("merge-step-completed")).toBe(true);
    expect(step?.querySelector(".merge-step-indicator")?.textContent).toBe("✓");
  });

  it("SSE failed event transitions step to failed with error reason", () => {
    const { element, onMergePhase } = createMergeProgress("T1", null);
    document.body.appendChild(element);

    onMergePhase({ payload: { taskId: "T1", phase: "rebase", status: "started" } });
    onMergePhase({ payload: { taskId: "T1", phase: "rebase", status: "failed", error: "rebase conflict" } });

    const step = element.querySelector("[data-phase='rebase']");
    expect(step?.classList.contains("merge-step-failed")).toBe(true);
    expect(step?.querySelector(".merge-step-indicator")?.textContent).toBe("✕");
    expect(step?.querySelector(".merge-step-error")?.textContent).toBe("rebase conflict");
  });

  it("ignores events for different taskId", () => {
    const { element, onMergePhase } = createMergeProgress("T1", null);
    document.body.appendChild(element);

    onMergePhase({ payload: { taskId: "T2", phase: "prepareMerge", status: "started" } });

    const step = element.querySelector("[data-phase='prepareMerge']");
    expect(step?.classList.contains("merge-step-idle")).toBe(true);
  });

  it("advances multiple steps in sequence", () => {
    const { element, onMergePhase } = createMergeProgress("T1", null);
    document.body.appendChild(element);

    const phasesToComplete = ["prepareMerge", "commit", "squash"] as const;
    for (const phase of phasesToComplete) {
      onMergePhase({ payload: { taskId: "T1", phase, status: "started" } });
      onMergePhase({ payload: { taskId: "T1", phase, status: "completed" } });
    }
    onMergePhase({ payload: { taskId: "T1", phase: "rebase", status: "started" } });

    for (const phase of phasesToComplete) {
      const step = element.querySelector(`[data-phase='${phase}']`);
      expect(step?.classList.contains("merge-step-completed")).toBe(true);
    }
    const rebaseStep = element.querySelector("[data-phase='rebase']");
    expect(rebaseStep?.classList.contains("merge-step-running")).toBe(true);
  });

  it("wires eventBus.on for merge-phase events", () => {
    const handlers = new Map<string, ((e: unknown) => void)[]>();
    const eventBus = {
      on: (kind: string, handler: (e: unknown) => void) => {
        const existing = handlers.get(kind) ?? [];
        handlers.set(kind, [...existing, handler]);
        return () => {};
      },
    };

    const { element } = createMergeProgress("T1", eventBus);
    document.body.appendChild(element);

    expect(handlers.has("merge-phase")).toBe(true);

    handlers.get("merge-phase")?.[0]?.({ payload: { taskId: "T1", phase: "commit", status: "started" } });
    const step = element.querySelector("[data-phase='commit']");
    expect(step?.classList.contains("merge-step-running")).toBe(true);
  });

  it("destroy() removes element from DOM and unsubscribes from eventBus", () => {
    let offCalled = false;
    const eventBus = {
      on: (_kind: string, _handler: (e: unknown) => void) => {
        return () => { offCalled = true; };
      },
    };

    const { element, destroy } = createMergeProgress("T1", eventBus);
    document.body.appendChild(element);
    destroy();

    expect(document.body.contains(element)).toBe(false);
    expect(offCalled).toBe(true);
  });
});
