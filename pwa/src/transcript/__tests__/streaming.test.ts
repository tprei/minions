import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStreamingBuffer } from "../streaming";
import type { ProviderEvent } from "../../domain/providerEvent";

function assistantText(n: number): ProviderEvent {
  return { kind: "assistant_text", text: `text ${n}` };
}

describe("createStreamingBuffer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    let rafId = 0;
    const pending = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = ++rafId;
      pending.set(id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      pending.delete(id);
    });
    (globalThis as unknown as { __pendingRaf: Map<number, FrameRequestCallback> }).__pendingRaf = pending;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function flushRaf(): void {
    const pending = (globalThis as unknown as { __pendingRaf: Map<number, FrameRequestCallback> }).__pendingRaf;
    for (const [id, cb] of Array.from(pending)) {
      pending.delete(id);
      cb(0);
    }
  }

  it("does not call onFlush before a RAF fires", () => {
    const onFlush = vi.fn();
    const buf = createStreamingBuffer(onFlush);
    buf.push(assistantText(0));
    buf.push(assistantText(1));
    expect(onFlush).not.toHaveBeenCalled();
    buf.stop();
  });

  it("batches multiple events into a single RAF flush", () => {
    const onFlush = vi.fn();
    const buf = createStreamingBuffer(onFlush);
    buf.push(assistantText(0));
    buf.push(assistantText(1));
    buf.push(assistantText(2));
    flushRaf();
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush.mock.calls[0][0]).toHaveLength(3);
    buf.stop();
  });

  it("schedules a new RAF for events pushed after the first flush", () => {
    const onFlush = vi.fn();
    const buf = createStreamingBuffer(onFlush);
    buf.push(assistantText(0));
    flushRaf();
    buf.push(assistantText(1));
    flushRaf();
    expect(onFlush).toHaveBeenCalledTimes(2);
    buf.stop();
  });

  it("does not flush after stop()", () => {
    const onFlush = vi.fn();
    const buf = createStreamingBuffer(onFlush);
    buf.push(assistantText(0));
    buf.stop();
    flushRaf();
    expect(onFlush).not.toHaveBeenCalled();
  });
});
