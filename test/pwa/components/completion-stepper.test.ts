import { describe, it, expect, beforeEach } from "vitest";
import { createCompletionStepper } from "../../../pwa/assets/components/completion-stepper.js";

const STEPS = ["finalizing", "pr-open", "ci-pending", "merged"];

function makeTask(executionStatus: string, id = "T1") {
  return {
    id,
    title: "Test task",
    executionStatus,
    stackStatus: "clean",
    dependsOn: [],
    artifacts: [],
    runs: [],
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("createCompletionStepper", () => {
  it("renders root element with completion-stepper class", () => {
    const { element, destroy } = createCompletionStepper({ task: makeTask("finalizing") });
    expect(element.className).toContain("completion-stepper");
    destroy();
  });

  it("renders 4 steps", () => {
    const { element, destroy } = createCompletionStepper({ task: makeTask("finalizing") });
    document.body.appendChild(element);

    const steps = element.querySelectorAll(".cs-step");
    expect(steps.length).toBe(4);
    destroy();
  });

  it("renders all 4 step labels", () => {
    const { element, destroy } = createCompletionStepper({ task: makeTask("finalizing") });
    document.body.appendChild(element);

    const steps = element.querySelectorAll(".cs-step");
    const stepNames = Array.from(steps).map((s) => s.getAttribute("data-step"));
    for (const step of STEPS) {
      expect(stepNames).toContain(step);
    }
    destroy();
  });

  it("current step has active class", () => {
    const { element, destroy } = createCompletionStepper({ task: makeTask("pr-open") });
    document.body.appendChild(element);

    const activeStep = element.querySelector("[data-step='pr-open']");
    expect(activeStep?.classList.contains("cs-step-active")).toBe(true);
    destroy();
  });

  it("active step shows pulse indicator", () => {
    const { element, destroy } = createCompletionStepper({ task: makeTask("ci-pending") });
    document.body.appendChild(element);

    const step = element.querySelector("[data-step='ci-pending']");
    const indicator = step?.querySelector(".cs-step-indicator");
    expect(indicator?.textContent).toBe("◌");
    destroy();
  });

  it("completed steps show checkmark", () => {
    const { element, destroy } = createCompletionStepper({ task: makeTask("merged") });
    document.body.appendChild(element);

    const finalizingStep = element.querySelector("[data-step='finalizing']");
    const prOpenStep = element.querySelector("[data-step='pr-open']");
    const ciStep = element.querySelector("[data-step='ci-pending']");

    expect(finalizingStep?.classList.contains("cs-step-completed")).toBe(true);
    expect(finalizingStep?.querySelector(".cs-step-indicator")?.textContent).toBe("✓");
    expect(prOpenStep?.classList.contains("cs-step-completed")).toBe(true);
    expect(ciStep?.classList.contains("cs-step-completed")).toBe(true);
    destroy();
  });

  it("future steps remain idle", () => {
    const { element, destroy } = createCompletionStepper({ task: makeTask("finalizing") });
    document.body.appendChild(element);

    const prOpenStep = element.querySelector("[data-step='pr-open']");
    const ciStep = element.querySelector("[data-step='ci-pending']");
    const mergedStep = element.querySelector("[data-step='merged']");

    expect(prOpenStep?.classList.contains("cs-step-idle")).toBe(true);
    expect(ciStep?.classList.contains("cs-step-idle")).toBe(true);
    expect(mergedStep?.classList.contains("cs-step-idle")).toBe(true);
    destroy();
  });

  it("hidden when task is in non-lifecycle status", () => {
    const { element, destroy } = createCompletionStepper({ task: makeTask("running") });
    document.body.appendChild(element);

    expect(element.style.display).toBe("none");
    destroy();
  });

  it("visible when task is in finalizing status", () => {
    const { element, destroy } = createCompletionStepper({ task: makeTask("finalizing") });
    document.body.appendChild(element);

    expect(element.style.display).not.toBe("none");
    destroy();
  });

  it("update() advances to next step", () => {
    const { element, update, destroy } = createCompletionStepper({ task: makeTask("finalizing") });
    document.body.appendChild(element);

    update(makeTask("pr-open"));

    const finalizingStep = element.querySelector("[data-step='finalizing']");
    const prOpenStep = element.querySelector("[data-step='pr-open']");

    expect(finalizingStep?.classList.contains("cs-step-completed")).toBe(true);
    expect(prOpenStep?.classList.contains("cs-step-active")).toBe(true);
    destroy();
  });

  it("failed task shows X icon and stopped label", () => {
    const task = makeTask("pr-open");
    const { element, update, destroy } = createCompletionStepper({ task });
    document.body.appendChild(element);

    update(makeTask("failed"));

    const stoppedSteps = element.querySelectorAll(".cs-step-stopped");
    expect(stoppedSteps.length).toBeGreaterThan(0);

    const anyIndicator = stoppedSteps[0]?.querySelector(".cs-step-indicator");
    expect(anyIndicator?.textContent).toBe("✕");

    const errorLabel = element.querySelector(".cs-error-label") as HTMLElement | null;
    expect(errorLabel?.style.display).not.toBe("none");
    expect(errorLabel?.textContent).toContain("Stopped");
    destroy();
  });

  it("cancelled task shows stopped indicator", () => {
    const task = makeTask("finalizing");
    const { element, update, destroy } = createCompletionStepper({ task });
    document.body.appendChild(element);

    update(makeTask("cancelled"));

    const errorLabel = element.querySelector(".cs-error-label");
    expect(errorLabel?.textContent).toContain("Stopped");
    destroy();
  });

  it("onTaskTransitioned only responds to matching taskId", () => {
    const { element, onTaskTransitioned, destroy } = createCompletionStepper({
      task: makeTask("finalizing", "T1"),
    });
    document.body.appendChild(element);

    onTaskTransitioned({
      payload: {
        taskId: "T99",
        fromExecutionStatus: "finalizing",
        toExecutionStatus: "pr-open",
      },
    });

    const finalizingStep = element.querySelector("[data-step='finalizing']");
    expect(finalizingStep?.classList.contains("cs-step-active")).toBe(true);
    destroy();
  });

  it("onTaskTransitioned advances stepper for matching taskId", () => {
    const { element, onTaskTransitioned, destroy } = createCompletionStepper({
      task: makeTask("finalizing", "T1"),
    });
    document.body.appendChild(element);

    onTaskTransitioned({
      payload: {
        taskId: "T1",
        fromExecutionStatus: "finalizing",
        toExecutionStatus: "pr-open",
      },
    });

    const prOpenStep = element.querySelector("[data-step='pr-open']");
    expect(prOpenStep?.classList.contains("cs-step-active")).toBe(true);
    destroy();
  });

  it("destroy() removes element from DOM", () => {
    const { element, destroy } = createCompletionStepper({ task: makeTask("finalizing") });
    document.body.appendChild(element);
    destroy();
    expect(document.body.contains(element)).toBe(false);
  });
});
