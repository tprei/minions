import * as fs from "node:fs";
import * as fsp from "node:fs/promises";

export interface LogChunk {
  offset: number;
  bytes: Uint8Array;
}

const READ_SIZE = 64 * 1024;

export async function* followLog(
  path: string,
  fromOffset: number,
  signal: AbortSignal,
): AsyncIterable<LogChunk> {
  if (signal.aborted) return;

  // Check file existence before opening
  try {
    await fsp.access(path);
  } catch {
    return;
  }

  const handle = await fsp.open(path, "r");
  let offset = fromOffset;

  // Register the watcher BEFORE the initial drain so any append landing between
  // replay and live-loop registration is captured by the appendPromise.
  let resolveAppend: (() => void) | undefined;
  let appendPromise: Promise<void> = new Promise((r) => { resolveAppend = r; });

  const onWatch = () => {
    const prev = resolveAppend;
    appendPromise = new Promise((r) => { resolveAppend = r; });
    prev?.();
  };

  fs.watchFile(path, { interval: 100 }, onWatch);

  const onAbort = () => { resolveAppend?.(); };
  signal.addEventListener("abort", onAbort);

  try {
    // Drain-then-await loop covers replay, race-window appends, and live tail uniformly.
    while (!signal.aborted) {
      const stat = await handle.stat();
      const size = stat.size;

      while (offset < size && !signal.aborted) {
        const toRead = Math.min(READ_SIZE, size - offset);
        const buf = Buffer.allocUnsafe(toRead);
        const { bytesRead } = await handle.read(buf, 0, toRead, offset);
        if (bytesRead === 0) break;
        yield { offset, bytes: new Uint8Array(buf.buffer, buf.byteOffset, bytesRead) };
        offset += bytesRead;
      }

      if (signal.aborted) break;
      await appendPromise;
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    fs.unwatchFile(path, onWatch);
    await handle.close();
  }
}
