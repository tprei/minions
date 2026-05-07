import type { RuntimeAttachOptions, RuntimeBackend } from "../runtime-backend.js";
import type { ProviderEvent, ProviderPlugin } from "../provider-plugin.js";
import { LineBuffer } from "../line-buffer.js";

export type RunProviderItem =
  | { kind: "provider"; event: ProviderEvent }
  | { kind: "offset"; offset: number };

export async function* runProvider(
  runtime: RuntimeBackend,
  sessionId: string,
  provider: ProviderPlugin,
  signal?: AbortSignal,
): AsyncIterable<RunProviderItem> {
  const buffer = new LineBuffer();
  const opts: RuntimeAttachOptions = signal !== undefined ? { fromOffset: 0, signal } : { fromOffset: 0 };

  for await (const chunk of runtime.attach(sessionId, opts)) {
    const lines = buffer.push(chunk.bytes);
    for (const line of lines) {
      const events = provider.parseFrame(line);
      for (const event of events) {
        yield { kind: "provider", event };
      }
    }
    yield { kind: "offset", offset: chunk.offset + chunk.bytes.byteLength };
  }

  const tail = buffer.flush();
  for (const line of tail) {
    const events = provider.parseFrame(line);
    for (const event of events) {
      yield { kind: "provider", event };
    }
  }
}
