const QUIET_THRESHOLD_MS = 5_000;
const WATCHDOG_MS = 70_000;

export function createSseClient({ url, onEvent, onStatus }) {
  let es = null;
  let closed = false;
  let lastCursor = null;
  let lastActivityAt = 0;
  let watchdogTimer = null;
  let reconnectTimer = null;
  let state = "connecting";

  function setState(s) {
    if (state === s) return;
    state = s;
    onStatus?.(s);
  }

  function buildUrl() {
    if (lastCursor === null) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}cursor=${encodeURIComponent(lastCursor)}`;
  }

  function clearWatchdog() {
    if (watchdogTimer !== null) {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }
  }

  function scheduleWatchdog() {
    clearWatchdog();
    if (closed) return;
    watchdogTimer = setTimeout(() => {
      if (closed) return;
      es?.close();
      es = null;
      doReconnect(false);
    }, WATCHDOG_MS);
  }

  function doReconnect(quiet) {
    if (closed) return;
    if (reconnectTimer !== null) return;
    clearWatchdog();
    if (!quiet) {
      setState("reconnecting");
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, quiet ? 100 : 1_000);
  }

  function connect() {
    if (closed) return;
    setState("connecting");

    es = new EventSource(buildUrl());

    es.onopen = () => {
      lastActivityAt = Date.now();
      setState("connected");
      scheduleWatchdog();
    };

    es.onerror = () => {
      es?.close();
      es = null;
      if (closed) return;
      const gap = Date.now() - lastActivityAt;
      doReconnect(lastActivityAt > 0 && gap < QUIET_THRESHOLD_MS);
    };

    es.onmessage = (evt) => {
      lastActivityAt = Date.now();
      if (evt.lastEventId) lastCursor = evt.lastEventId;
      scheduleWatchdog();
      if (state !== "connected") setState("connected");
      try {
        onEvent?.(JSON.parse(evt.data));
      } catch {
        // malformed SSE data; skip
      }
    };
  }

  function onVisibility() {
    if (document.visibilityState === "visible" && state !== "connected") forceReconnect();
  }

  function onOnline() {
    if (state !== "connected") forceReconnect();
  }

  function onPageshow(evt) {
    if (evt.persisted && state !== "connected") forceReconnect();
  }

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", onOnline);
  window.addEventListener("pageshow", onPageshow);

  navigator.serviceWorker?.addEventListener("message", (evt) => {
    if (evt.data?.type === "notification:navigate") {
      const { workflowId, taskId, urlPath } = evt.data;
      onEvent?.({ kind: "navigate", payload: { workflowId, taskId, urlPath } });
    }
  });

  connect();

  function forceReconnect() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    clearWatchdog();
    es?.close();
    es = null;
    lastActivityAt = 0;
    connect();
  }

  function close() {
    if (closed) return;
    closed = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    clearWatchdog();
    es?.close();
    es = null;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("pageshow", onPageshow);
    setState("closed");
  }

  return { close, forceReconnect };
}
