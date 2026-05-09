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
  let suppressNextConnecting = false;

  function setState(s) {
    if (state === s) return;
    state = s;
    onStatus?.(s);
  }

  function buildUrl() {
    if (lastCursor === null) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}since=${encodeURIComponent(lastCursor)}`;
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
    suppressNextConnecting = quiet;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, quiet ? 100 : 1_000);
  }

  function connect() {
    if (closed) return;
    if (!suppressNextConnecting) {
      setState("connecting");
    }
    suppressNextConnecting = false;

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

    function handleNamedEvent(evt) {
      lastActivityAt = Date.now();
      if (evt.lastEventId) lastCursor = evt.lastEventId;
      scheduleWatchdog();
      if (state !== "connected") setState("connected");
      try {
        onEvent?.(JSON.parse(evt.data));
      } catch {
        // malformed SSE data; skip
      }
    }

    const SSE_EVENT_TYPES = [
      "task-transitioned",
      "graph-operation-changed",
      "run-started",
      "run-ended",
      "workflow-status-changed",
      "provider-event",
      "merge-phase",
    ];

    for (const type of SSE_EVENT_TYPES) {
      es.addEventListener(type, handleNamedEvent);
    }
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
    suppressNextConnecting = false;
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
