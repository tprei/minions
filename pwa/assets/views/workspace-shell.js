import { createComposer } from "../components/composer.js";
import { createTranscriptPipeline } from "../transcript/pipeline.js";
import { createPrTab } from "./pr-tab.js";
import { createChecksPanel } from "./checks-panel.js";
import { createDiffViewer } from "./diff-viewer.js";
import { createMergeProgress } from "./merge-progress.js";
import { createCompletionStepper } from "../components/completion-stepper.js";
import { createCostBadge } from "../components/cost-badge.js";
import { agentColor } from "../utils/agent-color.js";

const PHASE_MAP = {
  "pending":         "input",
  "ready":           "input",
  "running":         "transcript",
  "completed":       "progress",
  "quality-pending": "progress",
  "finalizing":      "diff",
  "pr-open":         "diff",
  "ci-pending":      "progress",
  "merged":          "summary",
  "failed":          "error",
  "cancelled":       "error",
  "needs-review":    "operator",
};

const PROGRESS_CAPTION = {
  "completed":       "Task completed — finalizing",
  "quality-pending": "Running quality gates",
  "ci-pending":      "CI running",
};

function derivePhase(status) {
  if (!(status in PHASE_MAP)) throw new Error(`unknown executionStatus: ${status}`);
  return PHASE_MAP[status];
}

function deriveComposerMode(status, hasPendingApproval) {
  if (status === "running" && hasPendingApproval) return "approval";
  if (status === "running") return "running";
  if (status === "needs-review") return "feedback";
  if (status === "completed" || status === "quality-pending" || status === "ci-pending" || status === "finalizing" || status === "pr-open") return "disabled";
  if (status === "pending" || status === "ready" || status === "merged" || status === "failed" || status === "cancelled") return "idle";
  throw new Error(`unknown executionStatus: ${status}`);
}

function createTranscriptScroller() {
  const el = document.createElement("div");
  el.className = "transcript";
  return el;
}

function createSpinner(caption) {
  const wrap = document.createElement("div");
  wrap.className = "phase-progress-inner";

  const spinner = document.createElement("div");
  spinner.className = "phase-spinner";

  const cap = document.createElement("div");
  cap.className = "phase-progress-caption";
  cap.textContent = caption;

  wrap.appendChild(spinner);
  wrap.appendChild(cap);
  return wrap;
}

export function createWorkspaceShell({ workflowId, taskId, eventBus, task: initialTask, workflow: initialWorkflow }) {
  const root = document.createElement("div");
  root.className = "workspace-shell";

  const main = document.createElement("div");
  main.className = "workspace-main";
  root.appendChild(main);

  const rightRail = document.createElement("div");
  rightRail.className = "workspace-right-rail";
  root.appendChild(rightRail);

  const transcriptScroller = createTranscriptScroller();
  const transcriptPipeline = createTranscriptPipeline(transcriptScroller, { workflowId, taskId });

  let currentPhase = null;
  let currentStatus = null;
  let summaryPrLink = null;
  let currentPrTab = null;
  let currentMergeProgress = null;
  let currentTask = initialTask ?? null;
  let currentWorkflow = initialWorkflow ?? null;
  let completionStepper = null;
  let costBadge = null;
  let hasPendingApproval = false;

  const composer = createComposer({
    mode: "idle",
    taskId,
    workflowId,
    onSubmit(val, mode) {
      if (!currentStatus) return;
      let kind;
      if (mode === "feedback") {
        kind = "retry-task";
      } else {
        kind = "continue-task";
      }
      fetch("/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, workflowId, taskId, prompt: val }),
      }).catch(() => {});
    },
  });

  const taskHeader = document.createElement("div");
  taskHeader.className = "workspace-task-header";
  main.appendChild(taskHeader);

  completionStepper = createCompletionStepper({ task: currentTask });
  taskHeader.appendChild(completionStepper.element);

  costBadge = createCostBadge();
  taskHeader.appendChild(costBadge.element);

  const phases = {
    input:      buildPhaseInput(),
    transcript: buildPhaseTranscript(),
    progress:   buildPhaseProgress(),
    diff:       buildPhaseDiff(),
    summary:    buildPhaseSummary(),
    error:      buildPhaseError(),
    operator:   buildPhaseOperator(),
  };

  for (const [id, el] of Object.entries(phases)) {
    el.className = `phase-${id}`;
    el.style.display = "none";
    main.appendChild(el);
  }

  composer.onInput(() => {
    if (typeof phases.operator.__syncOperatorButtons === "function") {
      phases.operator.__syncOperatorButtons();
    }
  });

  transcriptPipeline.setOnApprovalChange((pendingEvent) => {
    hasPendingApproval = pendingEvent !== null;
    if (currentStatus) {
      composer.setMode(deriveComposerMode(currentStatus, hasPendingApproval));
    }
    if (hasPendingApproval) {
      const pendingEl = transcriptPipeline.getPendingApproval();
      composer.setApprovalHandlers({
        onApprove() { if (pendingEl && pendingEl.__approve) pendingEl.__approve(); },
        onDeny() { if (pendingEl && pendingEl.__openDeny) pendingEl.__openDeny(); },
      });
    } else {
      composer.setApprovalHandlers(null);
    }
  });

  function buildPhaseInput() {
    const el = document.createElement("div");

    const inputArea = document.createElement("div");
    inputArea.className = "phase-input-area";

    const textarea = document.createElement("textarea");
    textarea.className = "phase-input-textarea";
    textarea.placeholder = "Describe the task…";

    const startBtn = document.createElement("button");
    startBtn.className = "phase-input-start-btn";
    startBtn.textContent = "Start";
    startBtn.addEventListener("click", () => {
      fetch("/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "transition-task",
          workflowId,
          transition: {
            kind: "mark-ready",
            taskId,
            now: new Date().toISOString(),
          },
        }),
      }).catch(() => {});
    });

    const waitingCaption = document.createElement("div");
    waitingCaption.className = "phase-input-waiting-caption";

    const waitingSpinner = document.createElement("div");
    waitingSpinner.className = "phase-spinner";

    const waitingText = document.createElement("span");
    waitingText.className = "phase-input-waiting-text";
    waitingText.textContent = "Awaiting worker pickup";

    waitingCaption.appendChild(waitingSpinner);
    waitingCaption.appendChild(waitingText);
    waitingCaption.style.display = "none";

    inputArea.appendChild(textarea);
    inputArea.appendChild(startBtn);
    inputArea.appendChild(waitingCaption);
    el.appendChild(inputArea);

    el.__updateInputPhase = function (status) {
      if (status === "pending") {
        startBtn.style.display = "";
        waitingCaption.style.display = "none";
      } else {
        startBtn.style.display = "none";
        waitingCaption.style.display = "";
      }
    };

    return el;
  }

  function buildPhaseTranscript() {
    const el = document.createElement("div");

    const providerLabel = document.createElement("div");
    providerLabel.className = "transcript-provider-label";
    providerLabel.hidden = true;

    el.__providerLabel = providerLabel;
    el.appendChild(providerLabel);

    const scrollerWrap = document.createElement("div");
    scrollerWrap.className = "phase-transcript-scroller-wrap";
    scrollerWrap.appendChild(transcriptScroller);

    const composerWrap = document.createElement("div");
    composerWrap.className = "phase-transcript-composer";
    composerWrap.appendChild(composer.element);

    el.appendChild(scrollerWrap);
    el.appendChild(composerWrap);
    return el;
  }

  function updateProviderLabel(task) {
    const labelEl = phases?.transcript?.__providerLabel;
    if (!labelEl) return;
    const runs = Array.isArray(task?.runs) ? task.runs : [];
    const latestRun = runs.length > 0 ? runs[runs.length - 1] : null;
    const provider = latestRun?.providerType ?? null;
    if (provider) {
      const { accent } = agentColor(provider);
      labelEl.textContent = `Provider: ${provider}`;
      labelEl.style.color = accent;
      labelEl.hidden = false;
    } else {
      labelEl.hidden = true;
    }
  }

  function buildPhaseProgress() {
    const el = document.createElement("div");
    return el;
  }

  function buildPhaseDiff() {
    const el = document.createElement("div");

    const placeholder = document.createElement("div");
    placeholder.className = "phase-diff-placeholder";
    placeholder.textContent = "Diff";

    el.appendChild(placeholder);

    el.__mountPrTab = function(task, workflow) {
      if (currentPrTab) {
        currentPrTab.destroy();
        currentPrTab = null;
      }
      if (currentMergeProgress) {
        currentMergeProgress.destroy();
        currentMergeProgress = null;
      }

      const hasPr = task?.artifacts && [...task.artifacts].some((a) => a.kind === "pr");

      if (hasPr) {
        placeholder.style.display = "none";
        currentPrTab = createPrTab({
          task,
          workflow,
          deps: {
            createChecksPanel,
            createDiffViewer,
            createMergeProgress: (tId) => {
              if (currentMergeProgress) currentMergeProgress.destroy();
              currentMergeProgress = createMergeProgress(tId, eventBus);
              return currentMergeProgress;
            },
          },
        });
        el.appendChild(currentPrTab.element);
      } else {
        placeholder.style.display = "";
      }
    };

    return el;
  }

  function buildPhaseSummary() {
    const el = document.createElement("div");

    summaryPrLink = document.createElement("a");
    summaryPrLink.className = "phase-summary-pr-link";
    summaryPrLink.target = "_blank";
    summaryPrLink.rel = "noopener noreferrer";
    summaryPrLink.textContent = "View PR";

    const closeBtn = document.createElement("button");
    closeBtn.className = "phase-summary-close-btn";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", () => {
      window.location.hash = "";
    });

    el.appendChild(summaryPrLink);
    el.appendChild(closeBtn);
    return el;
  }

  function buildPhaseError() {
    // Recovery from failed/cancelled is not supported by the engine today.
    // "retry-task" requires needs-review; "mark-ready" requires pending.
    // Retry and Reset buttons are intentionally absent until a dedicated engine
    // recovery command exists. Do not add fake buttons here.
    const el = document.createElement("div");

    const errMsg = document.createElement("div");
    errMsg.className = "phase-error-msg";

    const caption = document.createElement("div");
    caption.className = "phase-error-recovery-caption";
    caption.textContent = "Recovery TBD — add engine command";

    el.appendChild(errMsg);
    el.appendChild(caption);
    return el;
  }

  function buildPhaseOperator() {
    const el = document.createElement("div");

    const recoveryFooter = document.createElement("div");
    recoveryFooter.className = "phase-operator-recovery";

    const continueBtn = document.createElement("button");
    continueBtn.className = "phase-operator-continue-btn";
    continueBtn.textContent = "Continue";
    continueBtn.disabled = true;

    const retryBtn = document.createElement("button");
    retryBtn.className = "phase-operator-retry-btn";
    retryBtn.textContent = "Retry";
    retryBtn.disabled = true;

    function syncOperatorButtons() {
      const empty = composer.getValue().trim() === "";
      continueBtn.disabled = empty;
      retryBtn.disabled = empty;
    }

    continueBtn.addEventListener("click", () => {
      const val = composer.getValue().trim();
      if (!val) return;
      fetch("/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "continue-task", workflowId, taskId, prompt: val }),
      }).then((res) => {
        if (res.ok) {
          composer.setValue("");
        }
      }).catch(() => {});
    });

    retryBtn.addEventListener("click", () => {
      const val = composer.getValue().trim();
      if (!val) return;
      fetch("/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "retry-task", workflowId, taskId, prompt: val }),
      }).then((res) => {
        if (res.ok) {
          composer.setValue("");
        }
      }).catch(() => {});
    });

    const abortBtn = document.createElement("button");
    abortBtn.className = "phase-operator-abort-btn";
    abortBtn.textContent = "Abort";
    abortBtn.addEventListener("click", () => {
      fetch("/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "transition-task",
          workflowId,
          transition: {
            kind: "cancel-task",
            taskId,
            now: new Date().toISOString(),
          },
        }),
      }).catch(() => {});
    });

    recoveryFooter.appendChild(continueBtn);
    recoveryFooter.appendChild(retryBtn);
    recoveryFooter.appendChild(abortBtn);

    const scrollerWrap = document.createElement("div");
    scrollerWrap.className = "phase-operator-transcript-wrap";

    const composerWrap = document.createElement("div");
    composerWrap.className = "phase-operator-composer";
    composerWrap.appendChild(composer.element);

    el.appendChild(recoveryFooter);
    el.appendChild(scrollerWrap);
    el.appendChild(composerWrap);

    el.__syncOperatorButtons = syncOperatorButtons;
    return el;
  }

  function placeTranscriptScroller(phaseId) {
    if (phaseId === "transcript") {
      const wrap = phases.transcript.querySelector(".phase-transcript-scroller-wrap");
      if (wrap && !wrap.contains(transcriptScroller)) wrap.appendChild(transcriptScroller);
    } else if (phaseId === "operator") {
      const wrap = phases.operator.querySelector(".phase-operator-transcript-wrap");
      if (wrap && !wrap.contains(transcriptScroller)) wrap.appendChild(transcriptScroller);
    }
  }

  function placeComposer(phaseId) {
    if (phaseId === "transcript") {
      const wrap = phases.transcript.querySelector(".phase-transcript-composer");
      if (wrap && !wrap.contains(composer.element)) wrap.appendChild(composer.element);
    } else if (phaseId === "operator") {
      const wrap = phases.operator.querySelector(".phase-operator-composer");
      if (wrap && !wrap.contains(composer.element)) wrap.appendChild(composer.element);
    }
  }

  function setExecutionStatus(status) {
    currentStatus = status;
    if (completionStepper && currentTask) {
      completionStepper.update({ ...currentTask, executionStatus: status });
    }
    const phase = derivePhase(status);

    if (phase === currentPhase) {
      updatePhaseInternals(phase, status, currentTask, currentWorkflow);
      return;
    }

    if (currentPhase && phases[currentPhase]) {
      phases[currentPhase].style.display = "none";
    }

    currentPhase = phase;

    updatePhaseInternals(phase, status, currentTask, currentWorkflow);
    placeTranscriptScroller(phase);
    placeComposer(phase);

    if (phases[phase]) {
      phases[phase].style.display = "";
    }
  }

  function updatePhaseInternals(phase, status, task, workflow) {
    composer.setMode(deriveComposerMode(status, hasPendingApproval));

    if (phase === "progress") {
      const caption = PROGRESS_CAPTION[status] ?? "Running…";
      phases.progress.innerHTML = "";
      phases.progress.appendChild(createSpinner(caption));
    }

    if (phase === "input" && typeof phases.input.__updateInputPhase === "function") {
      phases.input.__updateInputPhase(status);
    }

    if (phase === "diff" && typeof phases.diff.__mountPrTab === "function") {
      phases.diff.__mountPrTab(task ?? null, workflow ?? null);
    }

    if (phase === "transcript" || phase === "operator") {
      updateProviderLabel(task);
    }
  }

  function appendTranscriptEvent(payload) {
    const providerEvent = payload?.providerEvent ?? payload;
    transcriptPipeline.appendEvent(providerEvent);
  }

  function recordUsage(event) {
    if (costBadge) costBadge.handleUsageEvent(event);
  }

  function setArtifacts(artifacts, task, workflow) {
    if (task !== undefined) {
      currentTask = task;
      if (completionStepper) completionStepper.update(task);
      updateProviderLabel(task);
    }
    if (workflow !== undefined) currentWorkflow = workflow;

    if (summaryPrLink) {
      const prArtifact = [...artifacts].reverse().find((a) => a.kind === "pr");
      if (prArtifact?.ref) {
        summaryPrLink.href = prArtifact.ref;
      }
    }

    if (currentPhase === "diff" && typeof phases.diff.__mountPrTab === "function") {
      phases.diff.__mountPrTab(currentTask, currentWorkflow);
    }
  }

  function destroy() {
    if (completionStepper) {
      completionStepper.destroy();
      completionStepper = null;
    }
    if (costBadge) {
      costBadge.destroy();
      costBadge = null;
    }
    root.remove();
  }

  if (eventBus) {
    const off1 = eventBus.on?.("task-transitioned", (ev) => {
      if (ev.payload?.taskId === taskId) {
        setExecutionStatus(ev.payload.toExecutionStatus);
        if (completionStepper) completionStepper.onTaskTransitioned(ev);
      }
    });
    const off2 = eventBus.on?.("provider-event", (ev) => {
      if (ev.payload?.taskId === taskId) {
        appendTranscriptEvent(ev.payload);
      }
    });
    const off3 = eventBus.on?.("merge-phase", (ev) => {
      if (ev.payload?.taskId === taskId && currentMergeProgress) {
        currentMergeProgress.onMergePhase(ev);
      }
    });

    const origDestroy = destroy;
    destroy = function () {
      off1?.();
      off2?.();
      off3?.();
      origDestroy();
    };
  }

  return {
    element: root,
    destroy,
    setExecutionStatus,
    setArtifacts,
    appendTranscriptEvent,
    recordUsage,
  };
}
