const PHASES = ["prepareMerge", "commit", "squash", "rebase", "applyMerge", "finalize"];

const PHASE_LABELS = {
  prepareMerge: "Prepare",
  commit: "Commit",
  squash: "Squash",
  rebase: "Rebase",
  applyMerge: "Apply merge",
  finalize: "Finalize",
};

export function createMergeProgress(taskId, eventBus) {
  const root = document.createElement("div");
  root.className = "merge-progress";

  const stepEls = {};
  const phaseState = {};

  for (const phase of PHASES) {
    phaseState[phase] = "idle";
  }

  const stepsWrap = document.createElement("div");
  stepsWrap.className = "merge-progress-steps";

  for (const phase of PHASES) {
    const step = document.createElement("div");
    step.className = "merge-step merge-step-idle";
    step.dataset.phase = phase;

    const indicator = document.createElement("span");
    indicator.className = "merge-step-indicator";
    indicator.textContent = "○";

    const label = document.createElement("span");
    label.className = "merge-step-label";
    label.textContent = PHASE_LABELS[phase] ?? phase;

    const errorEl = document.createElement("span");
    errorEl.className = "merge-step-error";
    errorEl.style.display = "none";

    step.appendChild(indicator);
    step.appendChild(label);
    step.appendChild(errorEl);
    stepsWrap.appendChild(step);
    stepEls[phase] = { step, indicator, errorEl };
  }

  root.appendChild(stepsWrap);

  function updateStep(phase, status, error) {
    const els = stepEls[phase];
    if (!els) return;
    const { step, indicator, errorEl } = els;

    step.className = `merge-step merge-step-${status}`;

    if (status === "running") {
      indicator.textContent = "◌";
    } else if (status === "completed") {
      indicator.textContent = "✓";
    } else if (status === "failed") {
      indicator.textContent = "✕";
      if (error) {
        errorEl.textContent = error;
        errorEl.style.display = "";
      }
    } else {
      indicator.textContent = "○";
    }
  }

  function onMergePhase(event) {
    const payload = event.payload ?? event;
    if (payload.taskId !== taskId) return;
    const { phase, status, error } = payload;
    if (!PHASES.includes(phase)) return;

    if (status === "started") {
      phaseState[phase] = "running";
      updateStep(phase, "running");
    } else if (status === "completed") {
      phaseState[phase] = "completed";
      updateStep(phase, "completed");
    } else if (status === "failed") {
      phaseState[phase] = "failed";
      updateStep(phase, "failed", error);
    }
  }

  let offMergePhase = null;

  if (eventBus) {
    offMergePhase = eventBus.on?.("merge-phase", onMergePhase);
  }

  function destroy() {
    if (offMergePhase) offMergePhase();
    root.remove();
  }

  return { element: root, destroy, onMergePhase };
}
