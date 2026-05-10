import type { WorkflowEvent, WorkflowEventKind } from "../domain/types";
import type { SseConnectionState } from "./types";

const WATCHDOG_MS = 70_000;
const QUIET_THRESHOLD_MS = 5_000;
const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;
const MAX_ATTEMPTS_BEFORE_ERROR = 5;

const PERSISTENT_KINDS: ReadonlySet<WorkflowEventKind> = new Set([
  "task-transitioned",
  "graph-operation-changed",
  "run-started",
  "run-ended",
  "workflow-status-changed",
]);

export interface SseSubscription {
  close(): void;
  getState(): SseConnectionState;
}

export function subscribeWorkflow(
  workflowId: string,
  handlers: {
    onEvent: (evt: WorkflowEvent) => void;
    onStateChange?: (state: SseConnectionState) => void;
  },
): SseSubscription {
  let es: EventSource | null = null;
  let closed = false;
  let currentState: SseConnectionState = "idle";
  let lastEventCursor: number | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  let lastConnectAt = 0;
  let attempt = 0;
  const cleanups: Array<() => void> = [];

  function setState(s: SseConnectionState): void {
    if (s === currentState) return;
    currentState = s;
    handlers.onStateChange?.(s);
  }

  function clearRetryTimer(): void {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function resetWatchdog(): void {
    if (watchdogTimer !== null) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => {
      if (!closed) reconnect();
    }, WATCHDOG_MS);
  }

  function clearWatchdog(): void {
    if (watchdogTimer !== null) {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }
  }

  function buildUrl(): string {
    const base = `/workflows/${encodeURIComponent(workflowId)}/events`;
    if (lastEventCursor === undefined) return base;
    return `${base}?since=${encodeURIComponent(String(lastEventCursor))}`;
  }

  function open(): void {
    if (closed) return;

    lastConnectAt = Date.now();

    setState(currentState === "idle" ? "connecting" : currentState);

    es = new EventSource(buildUrl());

    const KINDS: WorkflowEventKind[] = [
      "task-transitioned",
      "graph-operation-changed",
      "run-started",
      "run-ended",
      "workflow-status-changed",
      "provider-event",
      "merge-phase",
    ];

    for (const kind of KINDS) {
      es.addEventListener(kind, (raw: MessageEvent) => {
        let data: unknown;
        try {
          data = JSON.parse(raw.data as string);
        } catch {
          return;
        }
        resetWatchdog();
        const evt = data as WorkflowEvent;
        if (PERSISTENT_KINDS.has(kind)) {
          lastEventCursor = evt.cursor;
        }
        handlers.onEvent(evt);
      });
    }

    es.addEventListener("open", () => {
      attempt = 0;
      setState("connected");
      resetWatchdog();
    });

    es.addEventListener("error", () => {
      es?.close();
      es = null;
      clearWatchdog();
      if (closed) return;

      attempt += 1;
      if (attempt >= MAX_ATTEMPTS_BEFORE_ERROR) {
        setState("error");
        return;
      }

      const gapMs = Date.now() - lastConnectAt;
      if (gapMs >= QUIET_THRESHOLD_MS) {
        setState("reconnecting");
      }
      reconnectAfterDelay();
    });
  }

  function reconnect(): void {
    clearRetryTimer();
    es?.close();
    es = null;
    clearWatchdog();
    if (closed) return;
    setState("reconnecting");
    attempt = 0;
    open();
  }

  function reconnectAfterDelay(): void {
    const ceiling = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1));
    const delay = ceiling + Math.random() * 500;
    retryTimer = setTimeout(() => {
      if (!closed) open();
    }, delay);
  }

  function isLive(): boolean {
    if (es === null) return false;
    return es.readyState === EventSource.OPEN;
  }

  if (typeof window !== "undefined") {
    const onVisibility = (): void => {
      if (typeof document !== "undefined" && document.visibilityState === "visible" && !isLive()) {
        reconnect();
      }
    };
    const onOnline = (): void => {
      if (!isLive()) reconnect();
    };
    const onPageShow = (e: PageTransitionEvent): void => {
      if (e.persisted && !isLive()) reconnect();
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
      cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);
    cleanups.push(() => window.removeEventListener("online", onOnline));
    cleanups.push(() => window.removeEventListener("pageshow", onPageShow));
  }

  open();

  return {
    close(): void {
      closed = true;
      clearRetryTimer();
      clearWatchdog();
      es?.close();
      es = null;
      for (const fn of cleanups) fn();
      cleanups.length = 0;
      setState("idle");
    },
    getState(): SseConnectionState {
      return currentState;
    },
  };
}
