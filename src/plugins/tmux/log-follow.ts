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

  try {
    // Replay existing content from fromOffset
    const stat = await handle.stat();
    let replayEnd = stat.size;

    while (offset < replayEnd && !signal.aborted) {
      const toRead = Math.min(READ_SIZE, replayEnd - offset);
      const buf = Buffer.allocUnsafe(toRead);
      const { bytesRead } = await handle.read(buf, 0, toRead, offset);
      if (bytesRead === 0) break;
      yield { offset, bytes: new Uint8Array(buf.buffer, buf.byteOffset, bytesRead) };
      offset += bytesRead;
    }

    if (signal.aborted) return;

    // Watch for appends
    let resolveAppend: (() => void) | undefined;
    let appendPromise: Promise<void> = new Promise((r) => { resolveAppend = r; });

    const onWatch = () => {
      const prev = resolveAppend;
      appendPromise = new Promise((r) => { resolveAppend = r; });
      prev?.();
    };

    fs.watchFile(path, { interval: 100 }, onWatch);

    const onAbort = () => {
      resolveAppend?.();
    };
    signal.addEventListener("abort", onAbort);

    try {
      while (!signal.aborted) {
        await appendPromise;
        if (signal.aborted) break;

        const stat2 = await handle.stat();
        const newSize = stat2.size;

        while (offset < newSize && !signal.aborted) {
          const toRead = Math.min(READ_SIZE, newSize - offset);
          const buf = Buffer.allocUnsafe(toRead);
          const { bytesRead } = await handle.read(buf, 0, toRead, offset);
          if (bytesRead === 0) break;
          yield { offset, bytes: new Uint8Array(buf.buffer, buf.byteOffset, bytesRead) };
          offset += bytesRead;
        }
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
      fs.unwatchFile(path, onWatch);
    }
  } finally {
    await handle.close();
  }
}
