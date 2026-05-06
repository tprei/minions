import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { followLog } from "../../../src/plugins/tmux/log-follow.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "mwf-log-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

async function collect(
  path: string,
  fromOffset: number,
  timeoutMs: number,
): Promise<{ offset: number; bytes: Uint8Array }[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const chunks: { offset: number; bytes: Uint8Array }[] = [];
  try {
    for await (const chunk of followLog(path, fromOffset, controller.signal)) {
      chunks.push(chunk);
    }
  } finally {
    clearTimeout(timer);
  }
  return chunks;
}

describe("followLog", () => {
  it("replays all bytes from offset 0 when file has content", async () => {
    const path = join(testDir, "test.log");
    writeFileSync(path, "hello world");

    const chunks = await collect(path, 0, 500);
    const allBytes = Buffer.concat(chunks.map((c) => Buffer.from(c.bytes)));
    expect(allBytes.toString()).toBe("hello world");
    expect(chunks[0]?.offset).toBe(0);
  });

  it("replays from mid-file offset, skipping earlier bytes", async () => {
    const path = join(testDir, "test.log");
    writeFileSync(path, "0123456789abcdef");

    const chunks = await collect(path, 5, 500);
    const allBytes = Buffer.concat(chunks.map((c) => Buffer.from(c.bytes)));
    expect(allBytes.toString()).toBe("56789abcdef");
    expect(chunks[0]?.offset).toBe(5);
  });

  it("yields newly appended bytes after initial replay", async () => {
    const path = join(testDir, "test.log");
    writeFileSync(path, "initial");

    const controller = new AbortController();
    const chunks: { offset: number; bytes: Uint8Array }[] = [];

    const iterPromise = (async () => {
      for await (const chunk of followLog(path, 0, controller.signal)) {
        chunks.push(chunk);
        // abort after we get the append chunk
        if (chunk.offset >= 7) {
          controller.abort();
        }
      }
    })();

    // Wait for initial replay, then append
    await new Promise((r) => setTimeout(r, 150));
    await appendFile(path, "-appended");

    await iterPromise;

    const allBytes = Buffer.concat(chunks.map((c) => Buffer.from(c.bytes)));
    expect(allBytes.toString()).toBe("initial-appended");
  });

  it("abort causes the iterator to return within 1s", async () => {
    const path = join(testDir, "test.log");
    writeFileSync(path, "");

    const controller = new AbortController();
    const start = Date.now();

    const iterPromise = (async () => {
      for await (const _chunk of followLog(path, 0, controller.signal)) {
        // no-op
      }
    })();

    setTimeout(() => controller.abort(), 150);
    await iterPromise;

    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("missing file yields nothing without throwing", async () => {
    const path = join(testDir, "nonexistent.log");
    const chunks = await collect(path, 0, 200);
    expect(chunks).toHaveLength(0);
  });

  it("appends written between stat and watch registration are not lost", async () => {
    // Race scenario: bytes appended during the replay-vs-watch window must still
    // be yielded. The drain-then-await loop guarantees this — every iteration
    // re-stats before awaiting the next append signal.
    const path = join(testDir, "test.log");
    writeFileSync(path, "first");

    const controller = new AbortController();
    const chunks: { offset: number; bytes: Uint8Array }[] = [];

    const iterPromise = (async () => {
      for await (const chunk of followLog(path, 0, controller.signal)) {
        chunks.push(chunk);
        if (chunk.offset + chunk.bytes.byteLength >= 11) {
          controller.abort();
        }
      }
    })();

    // Append immediately, before fs.watchFile's first poll tick (default 100ms)
    // — the second drain in the loop should still pick it up.
    await appendFile(path, "-second");

    await iterPromise;

    const allBytes = Buffer.concat(chunks.map((c) => Buffer.from(c.bytes)));
    expect(allBytes.toString()).toBe("first-second");
  });

  it("already-aborted signal yields nothing immediately", async () => {
    const path = join(testDir, "test.log");
    writeFileSync(path, "data");

    const controller = new AbortController();
    controller.abort();

    const chunks: { offset: number; bytes: Uint8Array }[] = [];
    for await (const chunk of followLog(path, 0, controller.signal)) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(0);
  });
});
