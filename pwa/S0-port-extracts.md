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

| File | Event kind handled |
|---|---|
| `approval.js` | `approval` — renders an approve/deny permission-request card with workflowId/taskId/requestId context |
| `assistant-text.js` | `assistant_text` — renders markdown via `marked` + `DOMPurify` with streaming partial-text support |
| `error.js` | `error` — renders an error message div with message text |
| `final.js` | `final` — renders a final-result label with stop-reason and optional text |
| `thinking.js` | `thinking` — renders a collapsible thinking-block button/panel |
| `tool-call.js` | `tool_call` — renders a tool-call row with status dot, tool name, and collapsible input |
| `tool-result.js` | `tool_result` — renders a tool-result row, styled differently for error results |
| `usage.js` | `usage` — renders a token/cost usage summary with color-coded cost tier |
