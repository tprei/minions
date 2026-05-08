import { transcriptNode } from "../app-v1.js";
import { createComposer } from "../components/composer.js";

const PHASE_MAP = {
  "pending":         "input",
  "ready":           "input",
  "running":         "transcript",
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
  if (status === "quality-pending" || status === "ci-pending" || status === "finalizing" || status === "pr-open") return "disabled";
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

  const transcriptScroller = createTranscriptScroller();

  let currentPhase = null;
  let currentStatus = null;
  let summaryPrLink = null;

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
    root.appendChild(el);
  }

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

    inputArea.appendChild(textarea);
    inputArea.appendChild(startBtn);
    el.appendChild(inputArea);
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

    el.appendChild(placeholder);
    el.appendChild(landBtn);
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
    continueBtn.addEventListener("click", () => {
      const val = composer.getValue().trim();
      fetch("/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "continue-task", workflowId, taskId, prompt: val }),
      }).catch(() => {});
    });

    const retryBtn = document.createElement("button");
    retryBtn.className = "phase-operator-retry-btn";
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", () => {
      const val = composer.getValue().trim();
      fetch("/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "retry-task", workflowId, taskId, prompt: val }),
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
  }

  function updatePhaseInternals(phase, status) {
    composer.setMode(deriveComposerMode(status));

    if (phase === "progress") {
      const caption = PROGRESS_CAPTION[status] ?? "Running…";
      phases.progress.innerHTML = "";
      phases.progress.appendChild(createSpinner(caption));
    }
  }

  function appendTranscriptEvent(payload) {
    const node = transcriptNode(payload);
    transcriptScroller.appendChild(node);
    transcriptScroller.scrollTop = transcriptScroller.scrollHeight;
  }

  function setArtifacts(artifacts) {
    if (!summaryPrLink) return;
    const prArtifact = [...artifacts].reverse().find((a) => a.kind === "pr");
    if (prArtifact?.url) {
      summaryPrLink.href = prArtifact.url;
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
      appendTranscriptEvent(ev.payload);
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
