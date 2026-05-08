import { createSheet } from "../components/sheet.js";
import { createStatusDot } from "../components/status-dot.js";
import { createRunsPanel } from "./runs.js";
import { render as renderBranch } from "../artifacts/branch.js";
import { render as renderCommit } from "../artifacts/commit.js";
import { render as renderPr } from "../artifacts/pr.js";
import { render as renderPatch } from "../artifacts/patch.js";
import { render as renderCiReport } from "../artifacts/ci-report.js";
import { render as renderQualityReport } from "../artifacts/quality-report.js";

const BUSY_STATUSES = new Set([
  "running", "quality-pending", "finalizing", "pr-open", "ci-pending",
]);

const STACK_TONE = {
  "restack-pending":  "tone-warn",
  "restacking":       "tone-info",
  "restack-conflict": "tone-danger",
  "stale-artifacts":  "tone-muted",
};

const ARTIFACT_RENDERERS = {
  branch:           renderBranch,
  commit:           renderCommit,
  pr:               renderPr,
  patch:            renderPatch,
  "ci-report":      renderCiReport,
  "quality-report": renderQualityReport,
};

function cleanupArtifacts(root) {
  root.querySelectorAll("*").forEach((el) => {
    if (typeof el.__artifactCleanup === "function") {
      el.__artifactCleanup();
    }
  });
}

function renderArtifact(artifact, ctx) {
  const renderer = ARTIFACT_RENDERERS[artifact.kind];
  if (!renderer) {
    const el = document.createElement("span");
    el.className = "artifact-unknown";
    el.textContent = artifact.kind;
    return el;
  }
  return renderer(artifact, ctx);
}

function buildTaskRow(taskId, task, onTaskFocus, ctx) {
  const row = document.createElement("div");
  row.className = "dag-task-row";
  row.dataset.taskId = taskId;

  const header = document.createElement("div");
  header.className = "dag-task-header";
  header.addEventListener("click", () => onTaskFocus(taskId));

  const busy = BUSY_STATUSES.has(task.executionStatus);
  const dot = createStatusDot(task.executionStatus, { busy });
  header.appendChild(dot);

  const titleEl = document.createElement("span");
  titleEl.className = "dag-task-title";
  titleEl.textContent = task.title || taskId;
  header.appendChild(titleEl);

  if (task.stackStatus && task.stackStatus !== "clean") {
    const pill = document.createElement("span");
    const toneClass = STACK_TONE[task.stackStatus] ?? "tone-muted";
    pill.className = `dag-stack-pill ${toneClass}`;
    pill.textContent = task.stackStatus;
    header.appendChild(pill);
  }

  if (task.dependsOn && task.dependsOn.length > 0) {
    const deps = document.createElement("div");
    deps.className = "dag-deps";
    for (const depId of task.dependsOn) {
      const chip = document.createElement("button");
      chip.className = "dag-dep-chip";
      chip.textContent = depId;
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        onTaskFocus(depId);
      });
      deps.appendChild(chip);
    }
    header.appendChild(deps);
  }

  row.appendChild(header);

  const body = document.createElement("div");
  body.className = "dag-task-body";

  if (task.artifacts && task.artifacts.length > 0) {
    const artifactsWrap = document.createElement("div");
    artifactsWrap.className = "dag-artifacts";
    for (const artifact of task.artifacts) {
      try {
        const el = renderArtifact(artifact, ctx);
        artifactsWrap.appendChild(el);
      } catch {
        const errEl = document.createElement("span");
        errEl.className = "artifact-error";
        errEl.textContent = `[${artifact.kind}: render error]`;
        artifactsWrap.appendChild(errEl);
      }
    }
    body.appendChild(artifactsWrap);
  }

  const { element: runsEl } = createRunsPanel({ task });
  body.appendChild(runsEl);

  row.appendChild(body);

  return row;
}

function buildPanelBody(workflow, onTaskFocus, ctx) {
  const body = document.createElement("div");
  body.className = "dag-panel-body";

  const graph = workflow.graph ?? {};
  for (const [taskId, task] of Object.entries(graph)) {
    const row = buildTaskRow(taskId, task, onTaskFocus, ctx);
    body.appendChild(row);
  }

  return body;
}

function isDesktop() {
  return window.matchMedia("(min-width: 768px)").matches;
}

export function createDagPanel({ workflow, onTaskFocus }) {
  const ctx = { workflowId: workflow.id, githubProxy: "/github/pr-detail" };

  let sheet = null;
  let inlineEl = null;
  let currentWorkflow = workflow;

  function buildBody() {
    return buildPanelBody(currentWorkflow, onTaskFocus, ctx);
  }

  function openMobile() {
    if (sheet) {
      sheet.destroy();
      sheet = null;
    }
    const body = buildBody();
    sheet = createSheet({ title: "Tasks", body, side: "bottom" });
  }

  function openDesktop(container) {
    if (inlineEl) {
      inlineEl.remove();
    }
    inlineEl = document.createElement("div");
    inlineEl.className = "dag-inline-panel";

    const heading = document.createElement("h3");
    heading.className = "dag-inline-heading";
    heading.textContent = "Tasks";
    inlineEl.appendChild(heading);

    const body = buildBody();
    inlineEl.appendChild(body);

    if (container) {
      container.appendChild(inlineEl);
    }
  }

  function open(container) {
    if (isDesktop()) {
      openDesktop(container);
    } else {
      openMobile();
    }
  }

  function update(newWorkflow) {
    currentWorkflow = newWorkflow;

    if (sheet && sheet.panel.classList.contains("open")) {
      const body = buildBody();
      const bodyEl = sheet.panel.querySelector(".sheet-body");
      if (bodyEl) {
        cleanupArtifacts(bodyEl);
        bodyEl.innerHTML = "";
        bodyEl.appendChild(body);
      }
    }

    if (inlineEl) {
      const existing = inlineEl.querySelector(".dag-panel-body");
      const newBody = buildBody();
      if (existing) {
        cleanupArtifacts(existing);
        existing.replaceWith(newBody);
      } else {
        inlineEl.appendChild(newBody);
      }
    }
  }

  function destroy() {
    if (sheet) {
      const bodyEl = sheet.panel.querySelector(".sheet-body");
      if (bodyEl) cleanupArtifacts(bodyEl);
      sheet.destroy();
      sheet = null;
    }
    if (inlineEl) {
      cleanupArtifacts(inlineEl);
      inlineEl.remove();
      inlineEl = null;
    }
  }

  return { open, update, destroy };
}
