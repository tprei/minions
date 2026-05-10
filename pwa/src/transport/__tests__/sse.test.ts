import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { subscribeWorkflow, type SseSubscription } from "../sse";

class FakeEventSource {
  static instance: FakeEventSource | null = null;
  static instances: FakeEventSource[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  listeners: Map<string, ((e: MessageEvent) => void)[]> = new Map();
  readyState = 0;
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instance = this;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: (e: MessageEvent) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  emit(type: string, data: unknown): void {
    if (type === "open") this.readyState = FakeEventSource.OPEN;
    const fns = this.listeners.get(type) ?? [];
    for (const fn of fns) {
      fn({ data: JSON.stringify(data) } as MessageEvent);
    }
  }

  emitNamed(name: string, payload: unknown): void {
    const fns = this.listeners.get(name) ?? [];
    for (const fn of fns) {
      fn({ data: JSON.stringify(payload) } as MessageEvent);
    }
  }

  emitError(): void {
    const fns = this.listeners.get("error") ?? [];
    for (const fn of fns) fn({} as MessageEvent);
  }
}

describe("subscribeWorkflow SSE reconnect", () => {
  const subs: SseSubscription[] = [];

  function track(s: SseSubscription): SseSubscription {
    subs.push(s);
    return s;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instance = null;
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    for (const s of subs) s.close();
    subs.length = 0;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("transitions to connected on open event", () => {
    const states: string[] = [];
    track(subscribeWorkflow("wf1", {
      onEvent: () => void 0,
      onStateChange: (s) => states.push(s),
    }));

    FakeEventSource.instance?.emit("open", {});
    expect(states).toContain("connected");
  });

  it("reconnects after watchdog timeout", async () => {
    track(subscribeWorkflow("wf1", { onEvent: () => void 0 }));
    const firstEs = FakeEventSource.instance;

    FakeEventSource.instance?.emit("open", {});

    await vi.advanceTimersByTimeAsync(70_001);

    expect(firstEs?.closed).toBe(true);
    expect(FakeEventSource.instance).not.toBe(firstEs);
  });

  it("does not reconnect after close()", async () => {
    const sub = subscribeWorkflow("wf1", { onEvent: () => void 0 });
    const firstEs = FakeEventSource.instance;

    sub.close();
    await vi.advanceTimersByTimeAsync(70_001);

    expect(FakeEventSource.instance).toBe(firstEs);
  });

  it("reconnects on error after delay", async () => {
    track(subscribeWorkflow("wf1", { onEvent: () => void 0 }));
    const firstEs = FakeEventSource.instance;

    FakeEventSource.instance?.emitError();

    await vi.advanceTimersByTimeAsync(2000);

    expect(FakeEventSource.instance).not.toBe(firstEs);
  });

  it("appends ?since= cursor on reconnect after a persistent event", async () => {
    track(subscribeWorkflow("wf1", { onEvent: () => void 0 }));
    const firstEs = FakeEventSource.instance;
    expect(firstEs?.url).toBe("/workflows/wf1/events");

    firstEs?.emit("open", {});
    firstEs?.emitNamed("task-transitioned", {
      cursor: 42,
      workflowId: "wf1",
      occurredAt: "2025-01-01T00:00:00Z",
      kind: "task-transitioned",
      payload: {
        taskId: "t1",
        fromExecutionStatus: "pending",
        toExecutionStatus: "running",
        fromStackStatus: "clean",
        toStackStatus: "clean",
        taskVersion: 2,
      },
    });

    firstEs?.emitError();
    await vi.advanceTimersByTimeAsync(2000);

    const secondEs = FakeEventSource.instance;
    expect(secondEs).not.toBe(firstEs);
    expect(secondEs?.url).toBe("/workflows/wf1/events?since=42");
  });

  it("does not advance ?since= for transient (provider-event) kinds", async () => {
    track(subscribeWorkflow("wf1", { onEvent: () => void 0 }));
    const firstEs = FakeEventSource.instance;
    firstEs?.emit("open", {});
    firstEs?.emitNamed("provider-event", {
      cursor: 99,
      workflowId: "wf1",
      occurredAt: "2025-01-01T00:00:00Z",
      kind: "provider-event",
      payload: { taskId: "t1", runId: "r1", providerEvent: {} },
    });

    firstEs?.emitError();
    await vi.advanceTimersByTimeAsync(2000);

    const secondEs = FakeEventSource.instance;
    expect(secondEs?.url).toBe("/workflows/wf1/events");
  });

  it("quiet reconnect (<5s gap) does not flip state to reconnecting", () => {
    const states: string[] = [];
    track(subscribeWorkflow("wf1", {
      onEvent: () => void 0,
      onStateChange: (s) => states.push(s),
    }));

    FakeEventSource.instance?.emit("open", {});
    expect(states).toEqual(["connecting", "connected"]);

    FakeEventSource.instance?.emitError();
    expect(states).toEqual(["connecting", "connected"]);
  });

  it("noisy reconnect (>=5s gap) flips state to reconnecting", async () => {
    const states: string[] = [];
    track(subscribeWorkflow("wf1", {
      onEvent: () => void 0,
      onStateChange: (s) => states.push(s),
    }));

    FakeEventSource.instance?.emit("open", {});
    await vi.advanceTimersByTimeAsync(5_000);
    FakeEventSource.instance?.emitError();

    expect(states).toContain("reconnecting");
  });

  it("flips to error state after MAX_ATTEMPTS_BEFORE_ERROR consecutive failures", async () => {
    const states: string[] = [];
    track(subscribeWorkflow("wf1", {
      onEvent: () => void 0,
      onStateChange: (s) => states.push(s),
    }));

    for (let i = 0; i < 5; i++) {
      FakeEventSource.instance?.emitError();
      await vi.advanceTimersByTimeAsync(60_000);
    }

    expect(states).toContain("error");
  });

  it("visibilitychange does not reconnect when already connected", () => {
    track(subscribeWorkflow("wf1", { onEvent: () => void 0 }));
    const firstEs = FakeEventSource.instance;
    firstEs?.emit("open", {});

    expect(firstEs?.readyState).toBe(FakeEventSource.OPEN);

    const beforeCount = FakeEventSource.instances.length;
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(FakeEventSource.instances.length).toBe(beforeCount);
    expect(firstEs?.closed).toBe(false);
  });
});
