# S0 port extracts

Verbatim source captures before vanilla-JS deletion. Delete this file in S6.

---

## 1. FNV-1a city alias hash

**Source:** `pwa/assets/utils/city-alias.js`
**Port target:** S5 → `pwa/src/utils/cityAlias.ts`

```js
const ADJECTIVES = [
  "amber", "calm", "fern", "drift", "azure", "brisk", "cedar", "dusk",
  "echo", "flint", "gilt", "haze", "iris", "jade", "keen", "lark",
  "mist", "navy", "opal", "pine", "quay", "reed", "sage", "tide",
  "umber", "vale", "wren", "xray", "yew", "zest", "bold", "crisp",
  "deep", "earl", "frost",
];

const CITIES = [
  "seoul", "lagos", "porto", "lima", "oslo", "tunis", "accra", "baku",
  "doha", "hanoi", "riga", "sofia", "tirana", "minsk", "niamey",
  "nassau", "apia", "suva", "honiara", "nuku", "funafuti", "tarawa",
  "majuro", "palikir", "yaren", "maloelap", "pohnpei", "dili", "sanaa",
  "muscat", "maseru", "mbabane", "gaborone", "moroni", "banjul",
];

function fnv1a32(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

export function fnv1a32ForTest(str) {
  return fnv1a32(str);
}

export function cityAlias(workflowId) {
  const hash = fnv1a32(workflowId);
  const adjIdx = hash % ADJECTIVES.length;
  const cityIdx = Math.floor(hash / ADJECTIVES.length) % CITIES.length;
  const num = hash % 1000;
  const numStr = String(num).padStart(3, "0");
  return `${ADJECTIVES[adjIdx]}-${CITIES[cityIdx]}-${numStr}`;
}
```

---

## 2. Transcript cluster-≥3 logic

**Source:** `pwa/assets/transcript/aggregate.js`
**Port target:** S3 → `pwa/src/transcript/aggregate.ts`

```js
export const CLUSTER_MIN = 3;

export class ClusterGroup {
  constructor(kind, toolName) {
    this.kind = kind;
    this.toolName = toolName;
    this.events = [];
    this.expanded = false;
  }

  push(event) {
    this.events.push(event);
  }

  get length() {
    return this.events.length;
  }
}

function clusterKey(event, kindsToCluster) {
  if (!kindsToCluster.has(event.kind)) return null;
  if (event.kind === "tool_call") return `tool_call:${event.name ?? ""}`;
  return event.kind;
}

export function aggregateConsecutive(events, kindsToCluster, previousGroups) {
  const groupById = new Map();
  if (previousGroups) {
    for (const item of previousGroups) {
      if (item instanceof ClusterGroup && item._id !== undefined) {
        groupById.set(item._id, item);
      }
    }
  }

  const result = [];
  let i = 0;

  while (i < events.length) {
    const ev = events[i];
    const key = clusterKey(ev, kindsToCluster);

    if (key === null) {
      result.push(ev);
      i++;
      continue;
    }

    let runLen = 1;
    while (
      i + runLen < events.length &&
      clusterKey(events[i + runLen], kindsToCluster) === key
    ) {
      runLen++;
    }

    if (runLen < CLUSTER_MIN) {
      for (let j = 0; j < runLen; j++) {
        result.push(events[i + j]);
      }
      i += runLen;
      continue;
    }

    const runEvents = events.slice(i, i + runLen);
    const groupId = `${key}:${i}`;

    let group = groupById.get(groupId);
    if (!group) {
      const toolName = ev.kind === "tool_call" ? (ev.name ?? "") : undefined;
      group = new ClusterGroup(ev.kind, toolName);
      group._id = groupId;
    }

    group.events = runEvents;
    result.push(group);
    i += runLen;
  }

  return result;
}
```

---

## 3. `notificationclick` deep-link handler

**Source:** `pwa/sw.js` (lines 124–140)
**Port target:** S4 → vite-plugin-pwa custom SW augmentation

```js
self.addEventListener("notificationclick", (evt) => {
  evt.notification.close();
  const { workflowId, taskId, urlPath } = evt.notification.data ?? {};

  evt.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const target = clientList.find((c) => c.url.startsWith(self.location.origin));
        if (target) {
          target.postMessage({ type: "notification:navigate", workflowId, taskId, urlPath });
          return target.focus();
        }
        return self.clients.openWindow(urlPath ?? "/");
      })
  );
});
```

---

## 4. Per-event-kind transcript renderers

**Source:** `pwa/assets/transcript/events/`
**Port target:** S3 → `pwa/src/transcript/events/*`

### `pwa/assets/transcript/events/approval.js`

Handles `approval` — renders an approve/deny permission-request card with workflowId/taskId/requestId context.

```js
export function render(event, ctx) {
  const workflowId = ctx?.workflowId ?? "";
  const taskId = ctx?.taskId ?? "";
  const requestId = event.id ?? "";
  const tool = event.tool ?? "unknown";
  const input = event.input ?? {};

  const el = document.createElement("div");
  el.className = "te te-approval";
  el.dataset.requestId = requestId;

  const header = document.createElement("div");
  header.className = "te-approval-header";
  header.textContent = `Permission request: ${tool}`;

  const inputPreview = document.createElement("div");
  inputPreview.className = "te-approval-input-preview";
  const inputStr = JSON.stringify(input);
  inputPreview.textContent = inputStr.length > 120 ? inputStr.slice(0, 120) + "…" : inputStr;

  const errorMsg = document.createElement("div");
  errorMsg.className = "te-approval-error";
  errorMsg.hidden = true;

  const successMsg = document.createElement("div");
  successMsg.className = "te-approval-success";
  successMsg.hidden = true;

  const defaultActions = document.createElement("div");
  defaultActions.className = "te-approval-actions";

  const approveBtn = document.createElement("button");
  approveBtn.className = "te-approval-approve-btn";
  approveBtn.type = "button";
  approveBtn.textContent = "Approve";

  const denyBtn = document.createElement("button");
  denyBtn.className = "te-approval-deny-btn";
  denyBtn.type = "button";
  denyBtn.textContent = "Deny";

  defaultActions.appendChild(approveBtn);
  defaultActions.appendChild(denyBtn);

  const denyForm = document.createElement("div");
  denyForm.className = "te-approval-deny-form";
  denyForm.hidden = true;

  const denyTextarea = document.createElement("textarea");
  denyTextarea.className = "te-approval-deny-textarea";
  denyTextarea.placeholder = "Reason for denial (required)";

  const denyFormActions = document.createElement("div");
  denyFormActions.className = "te-approval-deny-form-actions";

  const submitDenyBtn = document.createElement("button");
  submitDenyBtn.className = "te-approval-submit-deny-btn";
  submitDenyBtn.type = "button";
  submitDenyBtn.textContent = "Submit Deny";
  submitDenyBtn.disabled = true;

  const backBtn = document.createElement("button");
  backBtn.className = "te-approval-back-btn";
  backBtn.type = "button";
  backBtn.textContent = "Back";

  denyFormActions.appendChild(submitDenyBtn);
  denyFormActions.appendChild(backBtn);
  denyForm.appendChild(denyTextarea);
  denyForm.appendChild(denyFormActions);

  el.appendChild(header);
  el.appendChild(inputPreview);
  el.appendChild(errorMsg);
  el.appendChild(successMsg);
  el.appendChild(defaultActions);
  el.appendChild(denyForm);

  function setResolved(label) {
    defaultActions.hidden = true;
    denyForm.hidden = true;
    errorMsg.hidden = true;
    successMsg.hidden = false;
    successMsg.textContent = label;
    el.dataset.resolved = "true";
    if (ctx?.onResolved) ctx.onResolved(requestId);
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.hidden = false;
  }

  approveBtn.addEventListener("click", () => {
    approveBtn.disabled = true;
    denyBtn.disabled = true;
    errorMsg.hidden = true;

    const body = { kind: "approve-permission", workflowId, taskId, requestId, decision: "approve" };
    fetch("/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) => {
      if (res.ok) {
        setResolved("Approved");
      } else {
        approveBtn.disabled = false;
        denyBtn.disabled = false;
        showError(`Server error: ${res.status}`);
      }
    }).catch((err) => {
      approveBtn.disabled = false;
      denyBtn.disabled = false;
      showError(err instanceof Error ? err.message : "Request failed");
    });
  });

  denyBtn.addEventListener("click", () => {
    defaultActions.hidden = true;
    denyForm.hidden = false;
    denyTextarea.focus();
  });

  denyTextarea.addEventListener("input", () => {
    submitDenyBtn.disabled = denyTextarea.value.trim() === "";
  });

  backBtn.addEventListener("click", () => {
    denyForm.hidden = true;
    defaultActions.hidden = false;
    denyTextarea.value = "";
    submitDenyBtn.disabled = true;
  });

  submitDenyBtn.addEventListener("click", () => {
    const reason = denyTextarea.value.trim();
    if (!reason) return;

    submitDenyBtn.disabled = true;
    backBtn.disabled = true;
    errorMsg.hidden = true;

    const body = { kind: "approve-permission", workflowId, taskId, requestId, decision: "deny", reason };
    fetch("/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) => {
      if (res.ok) {
        setResolved("Denied");
      } else {
        submitDenyBtn.disabled = false;
        backBtn.disabled = false;
        showError(`Server error: ${res.status}`);
      }
    }).catch((err) => {
      submitDenyBtn.disabled = false;
      backBtn.disabled = false;
      showError(err instanceof Error ? err.message : "Request failed");
    });
  });

  el.__approve = function () {
    if (!approveBtn.disabled && !defaultActions.hidden) approveBtn.click();
  };

  el.__openDeny = function () {
    if (!denyBtn.disabled && !defaultActions.hidden) denyBtn.click();
  };

  return el;
}
```

### `pwa/assets/transcript/events/assistant-text.js`

Handles `assistant_text` — renders markdown via `marked` + `DOMPurify`.

```js
import { marked } from "/assets/vendor/marked.esm.js";
import DOMPurify from "/assets/vendor/dompurify.esm.js";

marked.setOptions({ breaks: true });

export function render(event) {
  const el = document.createElement("div");
  el.className = "te te-assistant-text";

  const content = document.createElement("div");
  content.className = "te-content te-markdown";
  const raw = marked.parse(event.text ?? "");
  content.innerHTML = DOMPurify.sanitize(raw);

  el.appendChild(content);
  return el;
}
```

### `pwa/assets/transcript/events/error.js`

Handles `error` — renders an error message div with optional collapsible stack trace.

```js
export function render(event) {
  const el = document.createElement("div");
  el.className = "te te-error";

  const msg = document.createElement("div");
  msg.className = "te-error-message";
  msg.textContent = event.message ?? "Unknown error";

  el.appendChild(msg);

  if (event.stack) {
    const stackToggle = document.createElement("button");
    stackToggle.className = "te-error-stack-toggle";
    stackToggle.type = "button";
    stackToggle.setAttribute("aria-expanded", "false");
    stackToggle.textContent = "Show stack trace";

    const stack = document.createElement("pre");
    stack.className = "te-error-stack";
    stack.hidden = true;
    stack.textContent = event.stack;

    stackToggle.addEventListener("click", () => {
      const expanded = stackToggle.getAttribute("aria-expanded") === "true";
      const next = !expanded;
      stackToggle.setAttribute("aria-expanded", String(next));
      stack.hidden = !next;
      stackToggle.textContent = next ? "Hide stack trace" : "Show stack trace";
    });

    el.appendChild(stackToggle);
    el.appendChild(stack);
  }

  return el;
}
```

### `pwa/assets/transcript/events/final.js`

Handles `final` — renders a session-complete label with sessionRef and optional exitMetadata.

```js
export function render(event) {
  const el = document.createElement("div");
  el.className = "te te-final";

  const label = document.createElement("div");
  label.className = "te-final-label";
  label.textContent = "Session complete";

  const ref = document.createElement("div");
  ref.className = "te-final-ref";
  ref.textContent = event.sessionRef ?? "";

  el.appendChild(label);
  el.appendChild(ref);

  if (event.exitMetadata && Object.keys(event.exitMetadata).length > 0) {
    const meta = document.createElement("pre");
    meta.className = "te-final-meta";
    meta.textContent = JSON.stringify(event.exitMetadata, null, 2);
    el.appendChild(meta);
  }

  return el;
}
```

### `pwa/assets/transcript/events/thinking.js`

Handles `thinking` — renders a collapsible thinking-block button/panel.

```js
export function render(event) {
  const el = document.createElement("div");
  el.className = "te te-thinking";

  const header = document.createElement("button");
  header.className = "te-thinking-toggle";
  header.setAttribute("aria-expanded", "false");
  header.type = "button";

  const chevron = document.createElement("span");
  chevron.className = "te-thinking-chevron";
  chevron.textContent = "▶";
  chevron.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "te-thinking-label";
  label.textContent = "Thinking…";

  header.appendChild(chevron);
  header.appendChild(label);

  const body = document.createElement("div");
  body.className = "te-thinking-body";
  body.hidden = true;

  const pre = document.createElement("pre");
  pre.className = "te-thinking-text";
  pre.textContent = event.text ?? "";

  body.appendChild(pre);

  header.addEventListener("click", () => {
    const expanded = header.getAttribute("aria-expanded") === "true";
    const next = !expanded;
    header.setAttribute("aria-expanded", String(next));
    body.hidden = !next;
    chevron.textContent = next ? "▼" : "▶";
  });

  el.appendChild(header);
  el.appendChild(body);
  return el;
}
```

### `pwa/assets/transcript/events/tool-call.js`

Handles `tool_call` — renders a tool-call row with status dot, name, input preview, and collapsible details. Cooperates with cluster groups via `ctx.group.setExpanded`.

```js
import { createStatusDot } from "/assets/components/status-dot.js";

export function render(event, ctx) {
  const el = document.createElement("div");
  el.className = "te te-tool-call";
  el.dataset.toolCallId = event.id ?? "";

  const header = document.createElement("div");
  header.className = "te-tool-call-header";

  const dot = createStatusDot("running", { size: "sm" });
  dot.className += " te-tool-status-dot";

  const name = document.createElement("span");
  name.className = "te-tool-name";
  name.textContent = event.name ?? "tool";

  const inputPreview = document.createElement("span");
  inputPreview.className = "te-tool-input-preview";
  const inputStr = JSON.stringify(event.input ?? {});
  inputPreview.textContent = inputStr.length > 60 ? inputStr.slice(0, 60) + "…" : inputStr;

  const expandBtn = document.createElement("button");
  expandBtn.className = "te-tool-expand-btn";
  expandBtn.type = "button";
  expandBtn.setAttribute("aria-expanded", "false");
  expandBtn.textContent = "▶";

  header.appendChild(dot);
  header.appendChild(name);
  header.appendChild(inputPreview);
  header.appendChild(expandBtn);

  const details = document.createElement("div");
  details.className = "te-tool-details";
  details.hidden = true;

  const inputPre = document.createElement("pre");
  inputPre.className = "te-tool-input-full";
  inputPre.textContent = JSON.stringify(event.input ?? {}, null, 2);

  details.appendChild(inputPre);

  expandBtn.addEventListener("click", () => {
    const expanded = expandBtn.getAttribute("aria-expanded") === "true";
    const next = !expanded;
    expandBtn.setAttribute("aria-expanded", String(next));
    details.hidden = !next;
    expandBtn.textContent = next ? "▼" : "▶";

    if (ctx?.group?.setExpanded) {
      ctx.group.setExpanded(next);
    }
  });

  el.__setStatus = function (status) {
    dot.remove();
    const newDot = createStatusDot(status, { size: "sm" });
    newDot.className += " te-tool-status-dot";
    header.insertBefore(newDot, header.firstChild);
  };

  el.__setExpanded = function (expanded) {
    expandBtn.setAttribute("aria-expanded", String(expanded));
    details.hidden = !expanded;
    expandBtn.textContent = expanded ? "▼" : "▶";
  };

  el.appendChild(header);
  el.appendChild(details);
  return el;
}
```

### `pwa/assets/transcript/events/tool-result.js`

Handles `tool_result` — renders a result row, styled differently for `isError`. Cooperates with cluster groups via `ctx.group.expanded`.

```js
export function render(event, ctx) {
  const el = document.createElement("div");
  el.className = event.isError
    ? "te te-tool-result te-tool-result-error"
    : "te te-tool-result";

  const label = document.createElement("span");
  label.className = "te-tool-result-label";
  label.textContent = event.isError ? "Error" : "Result";

  const outputEl = document.createElement("pre");
  outputEl.className = "te-tool-result-output";
  outputEl.hidden = ctx?.group?.expanded === false;

  const outputStr =
    typeof event.output === "string"
      ? event.output
      : JSON.stringify(event.output ?? null, null, 2);
  outputEl.textContent = outputStr.length > 500 ? outputStr.slice(0, 500) + "\n… (truncated)" : outputStr;

  el.__setExpanded = function (expanded) {
    outputEl.hidden = !expanded;
  };

  el.appendChild(label);
  el.appendChild(outputEl);
  return el;
}
```

### `pwa/assets/transcript/events/usage.js`

Handles `usage` — renders a cost/token pill with color-coded cost tier (`green` < $0.01, `yellow` < $0.10, `orange` < $1, `red` ≥ $1).

```js
function costTier(costUsd) {
  if (costUsd < 0.01) return "green";
  if (costUsd < 0.10) return "yellow";
  if (costUsd < 1.00) return "orange";
  return "red";
}

export function render(event) {
  const el = document.createElement("div");
  el.className = "te te-usage";

  const pill = document.createElement("span");
  pill.className = "te-usage-pill";

  if (typeof event.costUsd === "number") {
    const tier = costTier(event.costUsd);
    pill.className += ` te-usage-tier-${tier}`;
    pill.dataset.costTier = tier;
    pill.textContent = `$${event.costUsd.toFixed(4)}`;
  } else {
    pill.className += " te-usage-tier-tokens";
    const input = event.inputTokens ?? 0;
    const output = event.outputTokens ?? 0;
    const cached = event.cachedInputTokens ?? 0;
    const reasoning = event.reasoningTokens ?? 0;
    const parts = [`in:${input}`, `out:${output}`];
    if (cached > 0) parts.push(`cached:${cached}`);
    if (reasoning > 0) parts.push(`reasoning:${reasoning}`);
    pill.textContent = parts.join(" ");
  }

  el.appendChild(pill);
  return el;
}
```
