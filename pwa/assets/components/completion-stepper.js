const STEPS = ["finalizing", "pr-open", "ci-pending", "merged"];

const STEP_LABELS = {
  finalizing: "Finalizing",
  "pr-open": "PR open",
  "ci-pending": "CI",
  merged: "Merged",
};

const TERMINAL_FAILED = new Set(["failed", "cancelled"]);

function stepState(step, currentStatus) {
  const currentIdx = STEPS.indexOf(currentStatus);
  const stepIdx = STEPS.indexOf(step);

  if (currentIdx === -1) return "idle";

  if (stepIdx < currentIdx) return "completed";
  if (stepIdx === currentIdx) return "active";
  return "idle";
}

function buildStep(step) {
  const el = document.createElement("div");
  el.className = "cs-step cs-step-idle";
  el.dataset.step = step;

  const indicator = document.createElement("span");
  indicator.className = "cs-step-indicator";
  indicator.textContent = "○";

  const label = document.createElement("span");
  label.className = "cs-step-label";
  label.textContent = STEP_LABELS[step] ?? step;

  el.appendChild(indicator);
  el.appendChild(label);
  return { el, indicator };
}

export function createCompletionStepper({ task }) {
  const root = document.createElement("div");
  root.className = "completion-stepper";

  let currentTask = task;
  let lastLifecycleStatus = STEPS.includes(task?.executionStatus) ? task?.executionStatus : null;
  const stepEls = {};

  const stepsWrap = document.createElement("div");
  stepsWrap.className = "cs-steps";

  for (const step of STEPS) {
    const { el, indicator } = buildStep(step);
    stepsWrap.appendChild(el);
    stepEls[step] = { el, indicator };
  }

  root.appendChild(stepsWrap);

  const errorLabel = document.createElement("div");
  errorLabel.className = "cs-error-label";
  errorLabel.style.display = "none";
  root.appendChild(errorLabel);

  function applyStatus(status) {
    const isFailed = TERMINAL_FAILED.has(status);
    const isInLifecycle = STEPS.includes(status) || isFailed;

    root.style.display = isInLifecycle ? "" : "none";

    if (!isInLifecycle) return;

    if (isFailed) {
      let lastActive = null;
      const refStatus = lastLifecycleStatus;
      const refIdx = refStatus ? STEPS.indexOf(refStatus) : -1;

      for (const step of STEPS) {
        const { el, indicator } = stepEls[step];
        const stepIdx = STEPS.indexOf(step);
        if (refIdx >= 0 && stepIdx <= refIdx) {
          el.className = "cs-step cs-step-stopped";
          indicator.textContent = "✕";
          lastActive = step;
        } else {
          el.className = "cs-step cs-step-idle";
          indicator.textContent = "○";
        }
      }

      if (lastActive) {
        errorLabel.textContent = `Stopped at ${STEP_LABELS[lastActive] ?? lastActive}`;
        errorLabel.style.display = "";
      } else {
        errorLabel.textContent = "Stopped";
        errorLabel.style.display = "";
      }
      return;
    }

    lastLifecycleStatus = status;
    errorLabel.style.display = "none";

    for (const step of STEPS) {
      const { el, indicator } = stepEls[step];
      const state = stepState(step, status);

      el.className = `cs-step cs-step-${state}`;

      if (state === "completed") {
        indicator.textContent = "✓";
      } else if (state === "active") {
        indicator.textContent = "◌";
      } else {
        indicator.textContent = "○";
      }
    }
  }

  applyStatus(currentTask?.executionStatus ?? "pending");

  function update(newTask) {
    currentTask = newTask;
    applyStatus(newTask?.executionStatus ?? "pending");
  }

  function onTaskTransitioned(event) {
    const payload = event.payload ?? event;
    if (!payload || payload.taskId !== currentTask?.id) return;
    applyStatus(payload.toExecutionStatus);
  }

  function destroy() {
    root.remove();
  }

  return { element: root, update, onTaskTransitioned, destroy };
}
