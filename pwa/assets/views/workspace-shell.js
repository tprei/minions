import { createComposer } from "../components/composer.js";
import { createTranscriptPipeline } from "../transcript/pipeline.js";
import { createDraftPrPanel } from "./draft-pr-panel.js";

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

function deriveComposerMode(status) {
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

export function createWorkspaceShell({ workflowId, taskId, eventBus }) {
  const root = document.createElement("div");
  root.className = "workspace-shell";

  const main = document.createElement("div");
  main.className = "workspace-main";
  root.appendChild(main);

  const rightRail = document.createElement("div");
  rightRail.className = "workspace-right-rail";
  root.appendChild(rightRail);

  const transcriptScroller = createTranscriptScroller();
  const transcriptPipeline = createTranscriptPipeline(transcriptScroller);

  let currentPhase = null;
  let currentStatus = null;
  let summaryPrLink = null;
  let draftPrPanel = null;
  let currentArtifacts = [];

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

  function buildPhaseProgress() {
    const el = document.createElement("div");
    return el;
  }

  function buildPhaseDiff() {
    const el = document.createElement("div");

    const placeholder = document.createElement("div");
    placeholder.className = "phase-diff-placeholder";
    placeholder.textContent = "Diff";

    const landBtn = document.createElement("button");
    landBtn.className = "phase-diff-land-btn";
    landBtn.textContent = "Land";
    landBtn.addEventListener("click", () => {
      if (!currentStatus) return;
      fetch(`/workflows/${workflowId}/tasks/${taskId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch(() => {});
    });

    const draftPrSlot = document.createElement("div");
    draftPrSlot.className = "phase-diff-draft-pr-slot";

    el.appendChild(placeholder);
    el.appendChild(landBtn);
    el.appendChild(draftPrSlot);
    el.__draftPrSlot = draftPrSlot;
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
    const phase = derivePhase(status);

    if (phase === currentPhase) {
      updatePhaseInternals(phase, status);
      syncDraftPrPanel();
      return;
    }

    if (currentPhase && phases[currentPhase]) {
      phases[currentPhase].style.display = "none";
    }

    currentPhase = phase;

    updatePhaseInternals(phase, status);
    placeTranscriptScroller(phase);
    placeComposer(phase);

    if (phases[phase]) {
      phases[phase].style.display = "";
    }

    syncDraftPrPanel();
  }

  function updatePhaseInternals(phase, status) {
    composer.setMode(deriveComposerMode(status));

    if (phase === "progress") {
      const caption = PROGRESS_CAPTION[status] ?? "Running…";
      phases.progress.innerHTML = "";
      phases.progress.appendChild(createSpinner(caption));
    }

    if (phase === "input" && typeof phases.input.__updateInputPhase === "function") {
      phases.input.__updateInputPhase(status);
    }
  }

  function appendTranscriptEvent(payload) {
    const providerEvent = payload?.providerEvent ?? payload;
    transcriptPipeline.appendEvent(providerEvent);
  }

  function setArtifacts(artifacts) {
    currentArtifacts = artifacts;
    if (summaryPrLink) {
      const prArtifact = [...artifacts].reverse().find((a) => a.kind === "pr");
      if (prArtifact?.ref) {
        summaryPrLink.href = prArtifact.ref;
      }
    }
    syncDraftPrPanel();
  }

  function syncDraftPrPanel() {
    const slot = phases.diff?.__draftPrSlot;
    if (!slot) return;

    const hasPr = currentArtifacts.some((a) => a.kind === "pr");
    const showPanel = currentStatus === "finalizing" && !hasPr;

    if (showPanel && !draftPrPanel) {
      draftPrPanel = createDraftPrPanel({ workflowId, taskId, onDraft: null });
      slot.appendChild(draftPrPanel.element);
    } else if (!showPanel && draftPrPanel) {
      draftPrPanel.destroy();
      draftPrPanel = null;
    }
  }

  function destroy() {
    root.remove();
  }

  if (eventBus) {
    const off1 = eventBus.on?.("task-transitioned", (ev) => {
      if (ev.payload?.taskId === taskId) {
        setExecutionStatus(ev.payload.toExecutionStatus);
      }
    });
    const off2 = eventBus.on?.("provider-event", (ev) => {
      if (ev.payload?.taskId === taskId) {
        appendTranscriptEvent(ev.payload);
      }
    });

    const origDestroy = destroy;
    destroy = function () {
      off1?.();
      off2?.();
      origDestroy();
    };
  }

  return {
    element: root,
    destroy,
    setExecutionStatus,
    setArtifacts,
    appendTranscriptEvent,
  };
}
