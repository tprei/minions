import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { subscribeWorkflow } from "../sse";

class FakeEventSource {
  static instance: FakeEventSource | null = null;
  listeners: Map<string, ((e: MessageEvent) => void)[]> = new Map();
  readyState = 0;
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instance = this;
  }

  addEventListener(type: string, fn: (e: MessageEvent) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: unknown): void {
    const fns = this.listeners.get(type) ?? [];
    for (const fn of fns) {
      fn({ data: JSON.stringify(data) } as MessageEvent);
    }
  }

  emitError(): void {
    const fns = this.listeners.get("error") ?? [];
    for (const fn of fns) fn({} as MessageEvent);
  }
}

describe("subscribeWorkflow SSE reconnect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instance = null;
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("transitions to connected on open event", () => {
    const states: string[] = [];
    subscribeWorkflow("wf1", {
      onEvent: () => void 0,
      onStateChange: (s) => states.push(s),
    });

    FakeEventSource.instance?.emit("open", {});
    expect(states).toContain("connected");
  });

  it("reconnects after watchdog timeout", async () => {
    const sub = subscribeWorkflow("wf1", { onEvent: () => void 0 });
    const firstEs = FakeEventSource.instance;

    FakeEventSource.instance?.emit("open", {});

    await vi.advanceTimersByTimeAsync(70_001);

    expect(firstEs?.closed).toBe(true);
    expect(FakeEventSource.instance).not.toBe(firstEs);

    sub.close();
  });

  it("does not reconnect after close()", async () => {
    const sub = subscribeWorkflow("wf1", { onEvent: () => void 0 });
    const firstEs = FakeEventSource.instance;

    sub.close();
    await vi.advanceTimersByTimeAsync(70_001);

    expect(FakeEventSource.instance).toBe(firstEs);
  });

  it("reconnects on error after delay", async () => {
    subscribeWorkflow("wf1", { onEvent: () => void 0 });
    const firstEs = FakeEventSource.instance;

    FakeEventSource.instance?.emitError();

    await vi.advanceTimersByTimeAsync(4000);

    expect(FakeEventSource.instance).not.toBe(firstEs);
  });
});
