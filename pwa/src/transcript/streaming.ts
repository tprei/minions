import type { ProviderEvent } from "../domain/providerEvent";

type FlushCallback = (batch: ProviderEvent[]) => void;

export interface StreamingBuffer {
  push(event: ProviderEvent): void;
  stop(): void;
}

export function createStreamingBuffer(onFlush: FlushCallback): StreamingBuffer {
  const pending: ProviderEvent[] = [];
  let rafId: number | null = null;
  let stopped = false;

  function schedule(): void {
    if (rafId !== null || stopped) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (stopped || pending.length === 0) return;
      const batch = pending.splice(0, pending.length);
      onFlush(batch);
    });
  }

  return {
    push(event: ProviderEvent): void {
      if (stopped) return;
      pending.push(event);
      schedule();
    },

    stop(): void {
      stopped = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      pending.length = 0;
    },
  };
}
