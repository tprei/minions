import { createSseClient } from "./sse.js";
import { setupPush, subscribePush } from "./push.js";
import { createWorkspaceShell } from "./views/workspace-shell.js";
import { createDagPanel } from "./views/dag-panel.js";
import { createTasksPill } from "./components/header.js";
import { cityAlias } from "./utils/city-alias.js";
import { createFab } from "./components/fab.js";
import { createNewWorkflowSheet } from "./views/new-workflow-sheet.js";

export const state = {
  workflows: [],
  currentId: null,
  currentWorkflow: null,
  transcript: [],
  pushStatusByWorkflow: {},
  error: null,
  streamStatus: "closed",
};

let sseClient = null;
let routeGen = 0;
let currentShell = null;
let currentShellKey = null;
let currentDagPanel = null;
let newWorkflowSheet = null;
let fab = null;

document.addEventListener("DOMContentLoaded", bootstrap);

function bootstrap() {
  registerSW();
  setupPush({
    onUpdateAvailable: (_activate) => {},
    onInstallPromptAvailable: (_evt) => {},
  });

  fab = createFab({
    label: '+ New Workflow',
    icon: '+',
    onClick: () => {
      if (!newWorkflowSheet) {
        newWorkflowSheet = createNewWorkflowSheet({
          onSubmit: (workflowId) => {
            loadList();
            window.location.hash = `#/workflow/${workflowId}`;
          },
          onClose: () => {},
        });
      }
      newWorkflowSheet.open();
    },
  });

  loadList();
  window.addEventListener("hashchange", onRoute);
  onRoute();
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch((err) => {
    state.error = `Service worker registration failed: ${err.message}`;
    render();
    throw err;
  });
}

let currentRouteTaskId = null;

function onRoute() {
  const route = parseHash(window.location.hash);
  if (route) {
    state.currentId = route.workflowId;
    currentRouteTaskId = route.taskId;
    loadWorkflowAndSubscribe(route.workflowId);
  } else {
    state.currentId = null;
    currentRouteTaskId = null;
    state.currentWorkflow = null;
    state.transcript = [];
    destroyShell();
    destroyDagPanel();
    closeStream();
    render();
  }
}

function destroyShell() {
  if (currentShell) {
    currentShell.destroy();
    currentShell = null;
    currentShellKey = null;
  }
}

function destroyDagPanel() {
  if (currentDagPanel) {
    currentDagPanel.destroy();
    currentDagPanel = null;
  }
}

export function parseHash(hash) {
  const m = /^#\/workflow\/([^/]+)(?:\/task\/([^/]+))?$/.exec(hash);
  if (!m || !m[1]) return null;
  return { workflowId: m[1], taskId: m[2] ?? null };
}

function loadList() {
  fetch("/workflows")
    .then((r) => r.json())
    .then((data) => {
      state.workflows = data;
      render();
    })
    .catch((err) => {
      state.error = err.message;
      render();
    });
}

export function loadWorkflowAndSubscribe(id) {
  const myGen = ++routeGen;
  destroyShell();
  destroyDagPanel();
  closeStream();
  state.currentWorkflow = null;
  state.transcript = [];
  render();

  fetch(`/workflows/${id}`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((wf) => {
      if (myGen !== routeGen) return;
      state.currentWorkflow = wf;
      render();
      openStream(id);
    })
    .catch((err) => {
      if (myGen !== routeGen) return;
      state.error = err.message;
      render();
    });
}

function openStream(id) {
  closeStream();
  state.streamStatus = "connecting";
  updateLiveIndicator();

  sseClient = createSseClient({
    url: `/workflows/${id}/events`,
    onStatus: (s) => {
      state.streamStatus = s === "connected" ? "connected" : s === "reconnecting" ? "reconnecting" : "closed";
      updateLiveIndicator();
    },
    onEvent: (event) => {
      if (event.kind === "navigate") {
        const { workflowId, urlPath } = event.payload;
        window.location.hash = urlPath ?? `#/workflow/${workflowId}`;
        return;
      }

      if (event.kind === "task-transitioned") {
        const payload = event.payload;
        if (!state.currentWorkflow) return;
        const nodes = state.currentWorkflow.graph;
        const task = nodes[payload.taskId];
        if (task) nodes[payload.taskId] = { ...task, executionStatus: payload.toExecutionStatus };
        renderKanban();
        if (currentShell && currentShellKey === `${state.currentWorkflow.id}:${payload.taskId}`) {
          currentShell.setExecutionStatus(payload.toExecutionStatus);
        }
        const wfId = state.currentWorkflow.id;
        fetch(`/workflows/${wfId}`)
          .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
          .then((wf) => {
            if (!state.currentWorkflow || state.currentWorkflow.id !== wfId) return;
            state.currentWorkflow = wf;
            const updatedTask = wf.graph[payload.taskId];
            if (currentShell && currentShellKey === `${wfId}:${payload.taskId}` && updatedTask?.artifacts) {
              currentShell.setArtifacts(updatedTask.artifacts);
            }
            if (currentDagPanel) {
              currentDagPanel.update(wf);
            }
          })
          .catch(() => {});
        return;
      }

      if (event.kind === "workflow-status-changed") {
        const payload = event.payload;
        if (!state.currentWorkflow) return;
        state.currentWorkflow = { ...state.currentWorkflow, status: payload.toStatus };
        renderKanban();
        return;
      }

      if (event.kind === "provider-event") {
        const payload = event.payload;
        state.transcript.push(payload);
        if (currentShell && currentShellKey === `${state.currentWorkflow?.id}:${payload.taskId}`) {
          currentShell.appendTranscriptEvent(payload);
        } else if (!currentShell) {
          const node = transcriptNode(payload);
          const container = document.querySelector(".transcript");
          if (container) {
            container.appendChild(node);
            container.scrollTop = container.scrollHeight;
          }
        }
        return;
      }
    },
  });
}

function closeStream() {
  if (sseClient) {
    sseClient.close();
    sseClient = null;
  }
  state.streamStatus = "closed";
  updateLiveIndicator();
}

function updateLiveIndicator() {
  const indicator = document.querySelector(".live-indicator");
  if (!indicator) return;
  indicator.className = `live-indicator ${state.streamStatus}`;
  indicator.setAttribute("data-stream-status", state.streamStatus);
  const dot = indicator.querySelector(".live-dot");
  const label = indicator.querySelector(".live-label");
  if (state.streamStatus === "connected") {
    if (label) label.textContent = "LIVE";
  } else if (state.streamStatus === "reconnecting") {
    if (label) label.textContent = "RECONNECTING";
  } else {
    if (label) label.textContent = "OFFLINE";
  }
}

export function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  return d.toTimeString().slice(0, 8);
}

export function glyphFor(kind) {
  switch (kind) {
    case "assistant_text":    return "▸";
    case "thinking":          return "◇";
    case "tool_call":         return "▸";
    case "tool_result":       return "■";
    case "permission_request":return "⚠";
    case "usage":             return "∑";
    case "error":             return "✕";
    case "final":             return "■";
    default:                  return "▸";
  }
}

export function statusColorClass(status) {
  switch (status) {
    case "pending":
    case "ready":
      return "status-pending";
    case "running":
    case "finalizing":
    case "quality-pending":
    case "ci-pending":
      return "status-running";
    case "needs-review":
    case "pr-open":
      return "status-review";
    case "completed":
    case "merged":
      return "status-done";
    case "failed":
    case "cancelled":
      return "status-failed";
    default:
      return "status-pending";
  }
}

export function transcriptNode(payload) {
  const el = document.createElement("div");
  el.classList.add("msg");

  const kind = payload?.providerEvent?.kind ?? payload?.kind;
  const ev = payload?.providerEvent ?? payload;

  const ts = document.createElement("div");
  ts.className = "msg-ts";
  ts.textContent = formatTime(new Date());

  const glyph = document.createElement("div");
  glyph.className = "msg-glyph";

  const content = document.createElement("div");
  content.className = "msg-content";

  switch (kind) {
    case "assistant_text":
      el.classList.add("assistant");
      glyph.textContent = glyphFor("assistant_text");
      content.textContent = ev.text ?? "";
      break;

    case "thinking":
      el.classList.add("thinking");
      glyph.textContent = glyphFor("thinking");
      content.textContent = ev.text ?? "";
      break;

    case "tool_call": {
      el.classList.add("tool-call");
      glyph.textContent = glyphFor("tool_call");
      const summary = document.createElement("details");
      const sum = document.createElement("summary");
      sum.textContent = ev.name ?? "";
      const pre = document.createElement("pre");
      pre.textContent = JSON.stringify(ev.input, null, 2);
      summary.appendChild(sum);
      summary.appendChild(pre);
      content.textContent = `${ev.name}(${JSON.stringify(ev.input)})`;
      content.appendChild(summary);
      break;
    }

    case "tool_result":
      el.classList.add("tool-result");
      if (ev.isError) {
        el.classList.add("err");
        glyph.textContent = "✕";
      } else {
        glyph.textContent = glyphFor("tool_result");
      }
      content.textContent = JSON.stringify(ev.output);
      break;

    case "permission_request":
      el.classList.add("perm");
      glyph.textContent = glyphFor("permission_request");
      content.textContent = `permission: ${ev.tool}`;
      break;

    case "usage":
      el.classList.add("usage");
      glyph.textContent = glyphFor("usage");
      content.textContent = `tokens — in:${ev.inputTokens ?? 0} out:${ev.outputTokens ?? 0}`;
      break;

    case "error":
      el.classList.add("error");
      glyph.textContent = glyphFor("error");
      content.textContent = ev.message;
      break;

    case "final":
      el.classList.add("final");
      glyph.textContent = glyphFor("final");
      content.textContent = `final ${ev.sessionRef}`;
      break;

    default:
      el.classList.add("assistant");
      glyph.textContent = glyphFor(kind);
      content.textContent = JSON.stringify(payload);
  }

  el.appendChild(ts);
  el.appendChild(glyph);
  el.appendChild(content);

  return el;
}

function submitReply(taskId, prompt, fresh) {
  const body = {
    kind: fresh ? "retry-task" : "continue-task",
    workflowId: state.currentId,
    taskId,
    prompt,
  };

  fetch("/commands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

function enablePushForWorkflow(workflowId) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  fetch("/push/vapid-public-key")
    .then((r) => r.json())
    .then((data) => subscribePush(workflowId, data.publicKey))
    .then(() => {
      state.pushStatusByWorkflow[workflowId] = "subscribed";
      renderPushBanner();
    })
    .catch(() => {
      state.pushStatusByWorkflow[workflowId] = "denied";
      renderPushBanner();
    });
}

function render() {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = "";

  renderHeader(app);

  if (state.error) {
    const err = document.createElement("div");
    err.className = "err-msg";
    err.textContent = state.error;
    app.appendChild(err);
    return;
  }

  if (state.currentWorkflow) {
    renderPushBanner();
    const main = document.createElement("main");
    renderKanban(main);
    mountWorkspaceShell(main);
    app.appendChild(main);
  } else {
    renderWorkflowList(app);
  }
}

function mountWorkspaceShell(container) {
  const wf = state.currentWorkflow;
  if (!wf) return;

  const taskIds = Object.keys(wf.graph);
  const routeTaskId = currentRouteTaskId && wf.graph[currentRouteTaskId] ? currentRouteTaskId : null;
  const taskId = routeTaskId ?? taskIds[0] ?? "default";
  const task = wf.graph[taskId];
  const status = task?.executionStatus ?? "pending";
  const key = `${wf.id}:${taskId}`;

  if (currentShell && currentShellKey === key) {
    container.appendChild(currentShell.element);
  } else {
    destroyShell();
    currentShell = createWorkspaceShell({ workflowId: wf.id, taskId, eventBus: null });
    currentShellKey = key;
    container.appendChild(currentShell.element);
  }

  currentShell.setExecutionStatus(status);
  if (task?.artifacts) currentShell.setArtifacts(task.artifacts);

  if (new URLSearchParams(location.search).get("test") === "1") {
    window.__shell = currentShell;
  }
}

function renderHeader(container) {
  const hdr = document.createElement("header");

  const left = document.createElement("div");
  left.style.cssText = "display:flex;align-items:center;gap:8px;";

  const h1 = document.createElement("h1");
  h1.textContent = "Minions";
  left.appendChild(h1);

  if (state.currentWorkflow) {
    const alias = document.createElement("span");
    alias.className = "workflow-alias";
    alias.textContent = cityAlias(state.currentWorkflow.id);
    left.appendChild(alias);
  }

  hdr.appendChild(left);

  if (state.currentWorkflow) {
    const right = document.createElement("div");
    right.style.cssText = "display:flex;align-items:center;gap:8px;";

    const wf = state.currentWorkflow;
    const graph = wf.graph ?? {};
    const taskCount = Object.keys(graph).length;
    const hasNonClean = Object.values(graph).some(
      (t) => t.stackStatus && t.stackStatus !== "clean"
    );

    const tasksPill = createTasksPill({
      taskCount,
      hasNonClean,
      onClick: () => {
        if (!state.currentWorkflow) return;
        if (!currentDagPanel) {
          currentDagPanel = createDagPanel({
            workflow: state.currentWorkflow,
            onTaskFocus: (taskId) => {
              window.location.hash = `#/workflow/${state.currentWorkflow.id}/task/${taskId}`;
            },
          });
        }
        const railEl = document.querySelector(".workspace-right-rail");
        currentDagPanel.open(railEl ?? undefined);
      },
    });
    right.appendChild(tasksPill);

    const indicator = document.createElement("div");
    indicator.className = `live-indicator ${state.streamStatus}`;
    indicator.setAttribute("data-stream-status", state.streamStatus);

    const label = document.createElement("span");
    label.className = "live-label";
    label.textContent = state.streamStatus === "connected"
      ? "LIVE"
      : state.streamStatus === "reconnecting"
        ? "RECONNECTING"
        : "OFFLINE";

    const dot = document.createElement("span");
    dot.className = "live-dot";

    indicator.appendChild(label);
    indicator.appendChild(dot);
    right.appendChild(indicator);

    hdr.appendChild(right);
  }

  container.appendChild(hdr);
}

function renderPushBanner() {
  const app = document.getElementById("app");
  if (!app) return;

  let banner = app.querySelector(".banner");
  const pushStatus = state.pushStatusByWorkflow[state.currentId] ?? "idle";

  if (!banner) {
    banner = document.createElement("div");
    banner.className = "banner";
    const hdr = app.querySelector("header");
    if (hdr && hdr.nextSibling) {
      app.insertBefore(banner, hdr.nextSibling);
    } else {
      app.appendChild(banner);
    }
  }

  banner.innerHTML = "";

  if (pushStatus === "subscribed") {
    banner.classList.add("subscribed");
    const span = document.createElement("span");
    span.textContent = "notifications active ✓";
    banner.appendChild(span);
    setTimeout(() => banner.remove(), 3000);
    return;
  }

  if (pushStatus === "denied") {
    banner.classList.add("denied");
    const span = document.createElement("span");
    span.textContent = "notifications blocked · enable in browser settings";
    banner.appendChild(span);
    return;
  }

  if (pushStatus === "unsupported") {
    banner.classList.add("unsupported");
    const span = document.createElement("span");
    span.textContent = "push notifications not supported in this browser";
    banner.appendChild(span);
    return;
  }

  const span = document.createElement("span");
  span.textContent = "notifications off · enable →";
  banner.appendChild(span);
  banner.addEventListener("click", () => enablePushForWorkflow(state.currentId), { once: true });
}

function renderWorkflowList(container) {
  if (state.workflows.length === 0) {
    const loading = document.createElement("div");
    loading.className = "loading";
    loading.textContent = "No active workflows.";
    container.appendChild(loading);
  } else {
    const list = document.createElement("div");
    list.className = "workflow-list";

    for (const wf of state.workflows) {
      const item = document.createElement("div");
      const isActive = wf.id === state.currentId;
      item.className = `workflow-item${isActive ? " active" : ""}`;
      item.addEventListener("click", () => {
        window.location.hash = `#/workflow/${wf.id}`;
      });

      const titleEl = document.createElement("div");
      titleEl.className = "wf-title";
      titleEl.textContent = wf.title || wf.id;

      const idEl = document.createElement("div");
      idEl.className = "wf-id";
      idEl.textContent = wf.id;

      const meta = document.createElement("div");
      meta.className = "wf-meta";

      const statusEl = document.createElement("div");
      const sc = statusColorClass(wf.status ?? "pending");
      statusEl.className = `wf-status ${sc}`;
      statusEl.textContent = `[${wf.status ?? "unknown"}]`;

      const timeEl = document.createElement("div");
      timeEl.className = "wf-time";
      timeEl.textContent = wf.updatedAt ? formatTime(wf.updatedAt) : "";

      meta.appendChild(statusEl);
      meta.appendChild(timeEl);

      item.appendChild(titleEl);
      item.appendChild(idEl);
      item.appendChild(meta);
      list.appendChild(item);
    }

    container.appendChild(list);
  }

  if (fab) {
    container.appendChild(fab.element);
  }
}

function renderKanban(container) {
  const wf = state.currentWorkflow;
  if (!wf) return;

  let kanban = container
    ? null
    : document.querySelector(".kanban");

  if (kanban) {
    kanban.innerHTML = "";
  } else {
    kanban = document.createElement("div");
    kanban.className = "kanban";
    if (container) container.appendChild(kanban);
  }

  const BUCKET = {
    pending: "Pending",
    ready: "Pending",
    running: "Running",
    finalizing: "Running",
    "quality-pending": "Running",
    "ci-pending": "Running",
    "needs-review": "Review",
    "pr-open": "Review",
    completed: "Done",
    merged: "Done",
    failed: "Failed",
    cancelled: "Failed",
  };

  const columns = {
    Pending: [],
    Running: [],
    Review: [],
    Done: [],
    Failed: [],
  };

  for (const node of Object.values(wf.graph)) {
    const bucket = BUCKET[node.executionStatus] ?? "Pending";
    columns[bucket].push(node);
  }

  const statusClassMap = {
    Pending: "status-pending",
    Running: "status-running",
    Review: "status-review",
    Done: "status-done",
    Failed: "status-failed",
  };

  for (const [colName, tasks] of Object.entries(columns)) {
    if (tasks.length === 0 && colName !== "Pending" && colName !== "Running") continue;

    const col = document.createElement("div");
    col.className = "kanban-col";

    const colHeader = document.createElement("div");
    colHeader.className = "kanban-col-header";

    const h2 = document.createElement("h2");
    h2.textContent = colName.toUpperCase();

    const count = document.createElement("span");
    count.className = "kanban-col-count";
    count.textContent = String(tasks.length).padStart(2, "0");

    colHeader.appendChild(h2);
    colHeader.appendChild(count);
    col.appendChild(colHeader);

    for (const task of tasks) {
      const card = document.createElement("div");
      const sc = statusClassMap[colName] ?? "status-pending";
      card.className = `task-card ${sc}`;
      card.dataset.taskId = task.id;

      const titleRow = document.createElement("div");
      titleRow.className = "task-card-title";

      if (colName === "Running") {
        const arrow = document.createElement("span");
        arrow.className = "task-running-glyph";
        arrow.textContent = "▶";
        titleRow.appendChild(arrow);
      }

      const titleText = document.createTextNode(task.title || task.id);
      titleRow.appendChild(titleText);
      card.appendChild(titleRow);

      const meta = document.createElement("div");
      meta.className = "task-card-meta";
      const parts = [];
      if (task.attempt != null) parts.push(`attempt: ${task.attempt}`);
      if (task.runs != null) parts.push(`runs: ${task.runs}`);
      if (parts.length) meta.textContent = parts.join(" · ");
      card.appendChild(meta);

      col.appendChild(card);
    }

    kanban.appendChild(col);
  }
}

function renderTranscript(container) {
  let transcript = container
    ? null
    : document.querySelector(".transcript");

  if (!transcript) {
    transcript = document.createElement("div");
    transcript.className = "transcript";
    if (container) container.appendChild(transcript);
  }

  transcript.replaceChildren(...state.transcript.map(transcriptNode));
}

export function renderReply(container, workflow) {
  const wf = workflow !== undefined ? workflow : state.currentWorkflow;

  let reply = container ? null : document.querySelector(".reply");

  if (!reply) {
    reply = document.createElement("div");
    reply.className = "reply";
    if (container) container.appendChild(reply);
  }

  reply.innerHTML = "";

  const reviewTask = wf
    ? Object.values(wf.graph).find((n) => n.executionStatus === "needs-review")
    : undefined;

  if (!reviewTask) {
    const placeholder = document.createElement("div");
    placeholder.className = "reply-placeholder";
    placeholder.textContent = "No tasks awaiting review.";
    reply.appendChild(placeholder);
    return;
  }

  const taskId = reviewTask.id;

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Reply to agent…";
  reply.appendChild(input);

  const actions = document.createElement("div");
  actions.className = "reply-actions";

  const btnContinue = document.createElement("button");
  btnContinue.className = "btn-continue";
  btnContinue.textContent = "Continue";
  btnContinue.addEventListener("click", () => {
    const prompt = input.value.trim();
    if (!prompt) return;
    submitReply(taskId, prompt, false);
    input.value = "";
  });
  actions.appendChild(btnContinue);

  const btnFresh = document.createElement("button");
  btnFresh.className = "btn-fresh";
  btnFresh.textContent = "Start fresh";
  btnFresh.addEventListener("click", () => {
    const prompt = input.value.trim();
    if (!prompt) return;
    submitReply(taskId, prompt, true);
    input.value = "";
  });
  actions.appendChild(btnFresh);

  reply.appendChild(actions);
}
