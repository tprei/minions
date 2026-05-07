import type { RuntimeAttachOptions, RuntimeBackend } from "../runtime-backend.js";
import type { ProviderEvent, ProviderPlugin } from "../provider-plugin.js";
import { LineBuffer } from "../line-buffer.js";

export type RunProviderItem =
  | { kind: "provider"; event: ProviderEvent }
  | { kind: "offset"; offset: number };

// Offset is the upper bound of bytes received so far for the chunk.
// Yielding it before events means latestOffset is always >= the byte position
// of any event in the same chunk, so resume re-attaches from a safe position.
export async function* runProvider(
  runtime: RuntimeBackend,
  sessionId: string,
  provider: ProviderPlugin,
  signal?: AbortSignal,
): AsyncIterable<RunProviderItem> {
  const buffer = new LineBuffer();
  const opts: RuntimeAttachOptions = signal !== undefined ? { fromOffset: 0, signal } : { fromOffset: 0 };

  for await (const chunk of runtime.attach(sessionId, opts)) {
    const offset = chunk.offset + chunk.bytes.byteLength;
    yield { kind: "offset", offset };
    const lines = buffer.push(chunk.bytes);
    for (const line of lines) {
      const events = provider.parseFrame(line);
      for (const event of events) {
        yield { kind: "provider", event };
      }
    }
  }

  const tail = buffer.flush();
  for (const line of tail) {
    const events = provider.parseFrame(line);
    for (const event of events) {
      yield { kind: "provider", event };
    }
  }
}
