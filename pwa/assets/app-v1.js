export const state = {
  workflows: [],
  currentId: null,
  currentWorkflow: null,
  transcript: [],
  pushStatusByWorkflow: {},
  error: null,
};

let es = null;
let routeGen = 0;

document.addEventListener("DOMContentLoaded", bootstrap);

function bootstrap() {
  registerSW();
  loadList();
  window.addEventListener("hashchange", onRoute);
  navigator.serviceWorker?.addEventListener("message", (evt) => {
    if (evt.data?.type === "navigate") {
      window.location.hash = `#/workflow/${evt.data.workflowId}`;
    }
  });
  onRoute();
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

function onRoute() {
  const id = parseHash(window.location.hash);
  if (id) {
    state.currentId = id;
    loadWorkflowAndSubscribe(id);
  } else {
    state.currentId = null;
    state.currentWorkflow = null;
    state.transcript = [];
    closeStream();
    render();
  }
}

export function parseHash(hash) {
  const m = /^#\/workflow\/([^/]+)$/.exec(hash);
  if (!m || !m[1]) return null;
  return m[1];
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
  // generation counter ensures a late-resolving fetch from a prior navigation
  // can never overwrite state that belongs to the current route
  const myGen = ++routeGen;
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
  es = new EventSource(`/workflows/${id}/events`);

  es.addEventListener("task-transitioned", (e) => {
    const event = JSON.parse(e.data);
    const payload = event.payload;
    if (!state.currentWorkflow) return;
    const nodes = state.currentWorkflow.graph;
    const task = nodes[payload.taskId];
    if (task) nodes[payload.taskId] = { ...task, executionStatus: payload.toExecutionStatus };
    renderKanban();
  });

  es.addEventListener("workflow-status-changed", (e) => {
    const event = JSON.parse(e.data);
    const payload = event.payload;
    if (!state.currentWorkflow) return;
    state.currentWorkflow = { ...state.currentWorkflow, status: payload.toStatus };
    renderKanban();
  });

  es.addEventListener("provider-event", (e) => {
    const event = JSON.parse(e.data);
    const payload = event.payload;
    const node = transcriptNode(payload);
    state.transcript.push(payload);
    const container = document.querySelector(".transcript");
    if (container) {
      container.appendChild(node);
      container.scrollTop = container.scrollHeight;
    }
  });

  es.onerror = () => {};
}

function closeStream() {
  if (es) {
    es.close();
    es = null;
  }
}

export function transcriptNode(payload) {
  const el = document.createElement("div");
  el.classList.add("msg");

  const kind = payload?.providerEvent?.kind ?? payload?.kind;
  const ev = payload?.providerEvent ?? payload;

  switch (kind) {
    case "assistant_text":
      el.classList.add("assistant");
      el.textContent = ev.text ?? "";
      break;
    case "thinking":
      el.classList.add("thinking");
      el.textContent = ev.text ?? "";
      break;
    case "tool_call": {
      el.classList.add("tool-call");
      el.textContent = `${ev.name}(${JSON.stringify(ev.input)})`;
      break;
    }
    case "tool_result":
      el.classList.add("tool-result");
      if (ev.isError) el.classList.add("err");
      el.textContent = JSON.stringify(ev.output);
      break;
    case "permission_request":
      el.classList.add("perm");
      el.textContent = `permission: ${ev.tool}`;
      break;
    case "usage":
      el.classList.add("usage");
      el.textContent = `tokens — in:${ev.inputTokens ?? 0} out:${ev.outputTokens ?? 0}`;
      break;
    case "error":
      el.classList.add("error");
      el.textContent = ev.message;
      break;
    case "final":
      el.classList.add("final");
      el.textContent = `final ${ev.sessionRef}`;
      break;
    default:
      el.classList.add("assistant");
      el.textContent = JSON.stringify(payload);
  }

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

function setupPush(workflowId) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  navigator.serviceWorker.ready
    .then((reg) => fetch("/push/vapid-public-key").then((r) => r.json()).then((data) => ({ reg, key: data.publicKey })))
    .then(({ reg, key }) =>
      Notification.requestPermission().then((permission) => ({ reg, key, permission }))
    )
    .then(({ reg, key, permission }) => {
      if (permission !== "granted") {
        state.pushStatusByWorkflow[workflowId] = "denied";
        renderPushBanner();
        return;
      }
      return reg.pushManager
        .subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
        .then((sub) =>
          fetch("/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workflowId, subscription: sub.toJSON() }),
          })
        )
        .then(() => {
          state.pushStatusByWorkflow[workflowId] = "subscribed";
          renderPushBanner();
        });
    })
    .catch(() => {
      state.pushStatusByWorkflow[workflowId] = "denied";
      renderPushBanner();
    });
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function render() {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = "";

  const hdr = document.createElement("header");
  const h1 = document.createElement("h1");
  h1.textContent = "Minions";
  hdr.appendChild(h1);
  app.appendChild(hdr);

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
    renderTranscript(main);
    renderReply(main);
    app.appendChild(main);
  } else {
    renderWorkflowList(app);
  }
}

function renderPushBanner() {
  const app = document.getElementById("app");
  if (!app) return;

  let banner = app.querySelector(".banner");
  const pushStatus = state.pushStatusByWorkflow[state.currentId] ?? "idle";

  if (pushStatus === "subscribed") {
    if (banner) banner.remove();
    return;
  }

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

  if (pushStatus === "denied") {
    const span = document.createElement("span");
    span.textContent = "Notifications blocked. Enable in browser settings to receive updates.";
    banner.appendChild(span);
    return;
  }

  const span = document.createElement("span");
  span.textContent = "Enable push notifications for this workflow.";
  banner.appendChild(span);

  const btn = document.createElement("button");
  btn.textContent = "Enable notifications";
  btn.addEventListener("click", () => setupPush(state.currentId));
  banner.appendChild(btn);
}

function renderWorkflowList(container) {
  if (state.workflows.length === 0) {
    const loading = document.createElement("div");
    loading.className = "loading";
    loading.textContent = "No active workflows.";
    container.appendChild(loading);
    return;
  }

  const list = document.createElement("div");
  list.className = "workflow-list";

  for (const wf of state.workflows) {
    const item = document.createElement("div");
    item.className = "workflow-item";
    item.addEventListener("click", () => {
      window.location.hash = `#/workflow/${wf.id}`;
    });

    const idEl = document.createElement("div");
    idEl.className = "wf-id";
    idEl.textContent = wf.id;

    const statusEl = document.createElement("div");
    statusEl.className = "wf-status";
    statusEl.textContent = wf.status ?? "";

    item.appendChild(idEl);
    item.appendChild(statusEl);
    list.appendChild(item);
  }

  container.appendChild(list);
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

  for (const [status, tasks] of Object.entries(columns)) {
    if (tasks.length === 0 && status !== "Pending" && status !== "Running") continue;

    const col = document.createElement("div");
    col.className = "kanban-col";

    const h2 = document.createElement("h2");
    h2.textContent = status;
    col.appendChild(h2);

    for (const task of tasks) {
      const card = document.createElement("div");
      card.className = "task-card";
      card.textContent = task.title || task.id;
      card.dataset.taskId = task.id;
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

  const btnContinue = document.createElement("button");
  btnContinue.className = "btn-continue";
  btnContinue.textContent = "Continue";
  btnContinue.addEventListener("click", () => {
    const prompt = input.value.trim();
    if (!prompt) return;
    submitReply(taskId, prompt, false);
    input.value = "";
  });
  reply.appendChild(btnContinue);

  const btnFresh = document.createElement("button");
  btnFresh.className = "btn-fresh";
  btnFresh.textContent = "Start fresh";
  btnFresh.addEventListener("click", () => {
    const prompt = input.value.trim();
    if (!prompt) return;
    submitReply(taskId, prompt, true);
    input.value = "";
  });
  reply.appendChild(btnFresh);
}
