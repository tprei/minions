import { render as renderAssistantText } from "./events/assistant-text.js";
import { render as renderThinking } from "./events/thinking.js";
import { render as renderToolCall } from "./events/tool-call.js";
import { render as renderToolResult } from "./events/tool-result.js";
import { render as renderUsage } from "./events/usage.js";
import { render as renderError } from "./events/error.js";
import { render as renderFinal } from "./events/final.js";
import { marked } from "/assets/vendor/marked.esm.js";
import DOMPurify from "/assets/vendor/dompurify.esm.js";
import { aggregateConsecutive, ClusterGroup } from "./aggregate.js";
import { createStreamBuffer } from "./streaming.js";

marked.setOptions({ breaks: true });

const CLUSTER_KINDS = new Set(["tool_call"]);
const CLUSTER_TOOL_NAMES = new Set(["Read", "Edit", "Glob", "Grep"]);

const DISPATCH = {
  assistant_text: renderAssistantText,
  thinking: renderThinking,
  tool_call: renderToolCall,
  tool_result: renderToolResult,
  usage: renderUsage,
  error: renderError,
  final: renderFinal,
};

function shouldCluster(event) {
  if (event.kind !== "tool_call") return false;
  return CLUSTER_TOOL_NAMES.has(event.name ?? "");
}

function clusterableSet(events) {
  const kinds = new Set();
  for (const ev of events) {
    if (shouldCluster(ev)) kinds.add(`tool_call:${ev.name ?? ""}`);
  }
  return kinds;
}

function renderEvent(event) {
  const fn = DISPATCH[event.kind];
  if (fn) return fn(event);
  const el = document.createElement("div");
  el.className = "te te-unknown";
  el.textContent = JSON.stringify(event);
  return el;
}

function renderClusterGroup(group, onToggle) {
  const el = document.createElement("div");
  el.className = "te te-cluster";
  el.dataset.clusterKind = group.kind;
  el.dataset.clusterTool = group.toolName ?? "";

  const headerBtn = document.createElement("button");
  headerBtn.className = "te-cluster-header";
  headerBtn.type = "button";

  const chevron = document.createElement("span");
  chevron.className = "te-cluster-chevron";
  chevron.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "te-cluster-label";

  function updateHeader() {
    chevron.textContent = group.expanded ? "▼" : "▶";
    label.textContent = group.expanded
      ? `${group.toolName ?? group.kind} × ${group.length}`
      : `+${group.length} ${group.toolName ?? group.kind} calls`;
  }

  headerBtn.appendChild(chevron);
  headerBtn.appendChild(label);
  updateHeader();

  const body = document.createElement("div");
  body.className = "te-cluster-body";
  body.hidden = !group.expanded;

  for (const ev of group.events) {
    const fn = DISPATCH[ev.kind];
    if (fn) body.appendChild(fn(ev));
  }

  headerBtn.addEventListener("click", () => {
    group.expanded = !group.expanded;
    body.hidden = !group.expanded;
    updateHeader();
    if (onToggle) onToggle(group);
  });

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !group.expanded) {
          group.expanded = true;
          body.hidden = false;
          updateHeader();
          observer.disconnect();
          if (onToggle) onToggle(group);
        }
      }
    },
    { threshold: 0.5 }
  );
  observer.observe(el);

  el._observer = observer;
  el._group = group;
  el._body = body;
  el._updateHeader = updateHeader;

  el.appendChild(headerBtn);
  el.appendChild(body);
  return el;
}

const AUTO_SCROLL_THRESHOLD = 64;

export function createTranscriptPipeline(scrollerEl) {
  const events = [];
  let renderedItems = [];
  let currentAssistantEl = null;
  let streamBuffer = null;
  let autoScrollEnabled = true;
  let jumpBtn = null;

  function isNearBottom() {
    const { scrollTop, scrollHeight, clientHeight } = scrollerEl;
    return scrollHeight - scrollTop - clientHeight <= AUTO_SCROLL_THRESHOLD;
  }

  function scrollToBottom() {
    scrollerEl.scrollTop = scrollerEl.scrollHeight;
  }

  function updateJumpButton() {
    if (!jumpBtn) {
      jumpBtn = document.createElement("button");
      jumpBtn.className = "transcript-jump-btn";
      jumpBtn.type = "button";
      jumpBtn.textContent = "Jump to latest ↓";
      jumpBtn.hidden = true;

      jumpBtn.addEventListener("click", () => {
        autoScrollEnabled = true;
        scrollToBottom();
        jumpBtn.hidden = true;
      });

      const parent = scrollerEl.parentElement ?? scrollerEl;
      parent.style.position = parent.style.position || "relative";
      parent.appendChild(jumpBtn);
    }

    jumpBtn.hidden = autoScrollEnabled;
  }

  scrollerEl.addEventListener("scroll", () => {
    if (isNearBottom()) {
      autoScrollEnabled = true;
    } else {
      autoScrollEnabled = false;
    }
    updateJumpButton();
  });

  function maybeScroll() {
    if (autoScrollEnabled) {
      scrollToBottom();
    }
    updateJumpButton();
  }

  function recluster() {
    const kindsSet = new Set();
    for (const ev of events) {
      if (shouldCluster(ev)) kindsSet.add(`tool_call:${ev.name ?? ""}`);
    }
    const prevGroups = renderedItems.filter((x) => x instanceof ClusterGroup);
    return aggregateConsecutive(events, CLUSTER_KINDS, prevGroups);
  }

  function fullRerender() {
    scrollerEl.innerHTML = "";
    currentAssistantEl = null;
    const items = recluster();
    renderedItems = items;

    for (const item of items) {
      if (item instanceof ClusterGroup) {
        scrollerEl.appendChild(renderClusterGroup(item));
      } else {
        scrollerEl.appendChild(renderEvent(item));
      }
    }

    maybeScroll();
  }

  function appendEvent(event) {
    if (event.kind === "assistant_text") {
      if (!streamBuffer || !currentAssistantEl) {
        const el = document.createElement("div");
        el.className = "te te-assistant-text";
        const content = document.createElement("div");
        content.className = "te-content te-markdown te-streaming";
        el.appendChild(content);
        currentAssistantEl = { el, content, accumulated: "" };
        scrollerEl.appendChild(el);

        streamBuffer = createStreamBuffer((_chunk, flushedAccumulated) => {
          currentAssistantEl.content.innerHTML = DOMPurify.sanitize(marked.parse(flushedAccumulated));
          maybeScroll();
        });
      }

      const text = event.text ?? "";
      currentAssistantEl.accumulated += text;
      currentAssistantEl.content.innerHTML = DOMPurify.sanitize(
        marked.parse(currentAssistantEl.accumulated)
      );
      streamBuffer.appendDelta(text);
      events.push(event);
      maybeScroll();
      return;
    }

    if (streamBuffer) {
      streamBuffer.flush();
      streamBuffer = null;
      currentAssistantEl = null;
    }

    events.push(event);

    const prevCount = renderedItems.length;
    const items = recluster();
    renderedItems = items;

    if (
      items.length === prevCount + 1 &&
      !(items[items.length - 1] instanceof ClusterGroup)
    ) {
      const newEl = renderEvent(event);
      scrollerEl.appendChild(newEl);
      maybeScroll();
      return;
    }

    const lastPrev = prevCount > 0 ? renderedItems[prevCount - 1] : null;
    const lastNew = items[items.length - 1];

    if (
      lastNew instanceof ClusterGroup &&
      lastPrev instanceof ClusterGroup &&
      lastPrev._id === lastNew._id
    ) {
      const existingEl = scrollerEl.lastElementChild;
      if (existingEl && existingEl._group === lastNew) {
        const body = existingEl._body;
        if (lastNew.expanded) {
          body.hidden = false;
          const newEv = lastNew.events[lastNew.events.length - 1];
          const fn = DISPATCH[newEv.kind];
          if (fn) body.appendChild(fn(newEv));
        }
        if (existingEl._updateHeader) existingEl._updateHeader();
        maybeScroll();
        return;
      }
    }

    fullRerender();
  }

  function reset() {
    if (streamBuffer) {
      streamBuffer.reset();
      streamBuffer = null;
    }
    currentAssistantEl = null;
    events.length = 0;
    renderedItems = [];
    scrollerEl.innerHTML = "";
    if (jumpBtn) jumpBtn.hidden = true;
  }

  return { appendEvent, reset };
}
