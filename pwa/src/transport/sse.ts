import type { WorkflowEvent, WorkflowEventKind } from "../domain/types";
import type { SseConnectionState } from "./types";

const WATCHDOG_MS = 70_000;
const QUIET_THRESHOLD_MS = 5_000;

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

  function open(): void {
    if (closed) return;

    lastConnectAt = Date.now();

    const headers: Record<string, string> = {};
    if (lastEventCursor !== undefined) {
      headers["Last-Event-ID"] = String(lastEventCursor);
    }

    const url = `/workflows/${encodeURIComponent(workflowId)}/events`;

    setState(currentState === "idle" ? "connecting" : "reconnecting");

    es = new EventSource(url);

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
      setState("connected");
      resetWatchdog();
    });

    es.addEventListener("error", () => {
      es?.close();
      es = null;
      clearWatchdog();
      if (closed) return;
      const gapMs = Date.now() - lastConnectAt;
      if (gapMs < QUIET_THRESHOLD_MS) {
        reconnectAfterDelay();
      } else {
        setState("reconnecting");
        reconnectAfterDelay();
      }
    });
  }

  function reconnect(): void {
    clearRetryTimer();
    es?.close();
    es = null;
    clearWatchdog();
    if (closed) return;
    setState("reconnecting");
    open();
  }

  function reconnectAfterDelay(): void {
    const delay = 1000 + Math.random() * 2000;
    retryTimer = setTimeout(() => {
      if (!closed) open();
    }, delay);
  }

  if (typeof window !== "undefined") {
    const onVisibility = (): void => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        reconnect();
      }
    };
    const onOnline = (): void => {
      reconnect();
    };
    const onPageShow = (e: PageTransitionEvent): void => {
      if (e.persisted) reconnect();
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
