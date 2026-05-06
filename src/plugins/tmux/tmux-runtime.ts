import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, writeFile } from "node:fs/promises";
import type { RuntimeProbeState } from "../../application/recovery.js";
import type {
  RuntimeAttachOptions,
  RuntimeBackend,
  RuntimeOutputChunk,
  RuntimeStartResult,
  RuntimeStartSpec,
} from "../runtime-backend.js";
import { buildLauncherScript } from "./launcher-script.js";
import { followLog } from "./log-follow.js";
import { TmuxClient, TmuxNoSuchSessionError } from "./tmux-client.js";

export interface TmuxRuntimeConfig {
  dataDir: string;
  socketName?: string;
  tmuxBin?: string;
  shortIdLen?: number;
}

function makeSessionId(taskId: string, shortIdLen: number): string {
  const slug = taskId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "task";
  const hash8 = createHash("sha1").update(taskId).digest("hex").slice(0, 8);
  const shortId = randomBytes(Math.ceil(shortIdLen / 2))
    .toString("hex")
    .slice(0, shortIdLen);
  return `mwf-${slug}-${hash8}-${shortId}`;
}

export class TmuxRuntimeBackend implements RuntimeBackend {
  private readonly client: TmuxClient;
  private readonly config: Required<TmuxRuntimeConfig>;

  constructor(config: TmuxRuntimeConfig) {
    this.config = {
      dataDir: config.dataDir,
      socketName: config.socketName ?? "minions",
      tmuxBin: config.tmuxBin ?? "tmux",
      shortIdLen: config.shortIdLen ?? 6,
    };
    this.client = new TmuxClient({
      socketName: this.config.socketName,
      tmuxBin: this.config.tmuxBin,
    });
  }

  async start(spec: RuntimeStartSpec): Promise<RuntimeStartResult> {
    if (spec.command.length === 0 || spec.command.every((s) => s.trim() === "")) {
      throw new Error("command must be non-empty");
    }

    const sessionId = makeSessionId(spec.taskId, this.config.shortIdLen);
    const releaseToken = `release-${sessionId}`;

    await mkdir(`${this.config.dataDir}/sessions`, { recursive: true });

    const scriptPath = `${this.config.dataDir}/sessions/${sessionId}.sh`;
    const logPath = `${this.config.dataDir}/sessions/${sessionId}.log`;

    await writeFile(
      scriptPath,
      buildLauncherScript({
        command: spec.command,
        ...(spec.env !== undefined ? { env: spec.env } : {}),
        ...(spec.workspacePath !== undefined ? { cwd: spec.workspacePath } : {}),
        socketName: this.config.socketName,
        releaseToken,
        tmuxBin: this.config.tmuxBin,
      }),
      { mode: 0o755 },
    );

    // Touch the log file so followLog can open it immediately
    await writeFile(logPath, "", { flag: "a" });

    await this.client.newSession({ name: sessionId, scriptPath });

    try {
      await this.client.setWindowOption(sessionId, "remain-on-exit", "on");
      await this.client.pipePane(sessionId, logPath);
      await this.client.waitForSignal(releaseToken);
    } catch (err) {
      await this.client.killSession(sessionId).catch(() => {});
      throw err;
    }

    return { sessionId, runtimeType: "tmux" };
  }

  async stop(sessionId: string): Promise<void> {
    try {
      await this.client.pipePaneOff(sessionId).catch((err) => {
        if (err instanceof TmuxNoSuchSessionError) return;
        throw err;
      });
      await this.client.killSession(sessionId);
    } catch (err) {
      if (err instanceof TmuxNoSuchSessionError) return;
      throw err;
    }
  }

  async probe(sessionId: string): Promise<RuntimeProbeState> {
    const exists = await this.client.sessionExists(sessionId);
    if (!exists) return "missing";
    const dead = await this.client.paneDead(sessionId);
    return dead ? "dead" : "live";
  }

  async *attach(
    sessionId: string,
    opts: RuntimeAttachOptions = {},
  ): AsyncIterable<RuntimeOutputChunk> {
    const logPath = `${this.config.dataDir}/sessions/${sessionId}.log`;
    const fromOffset = opts.fromOffset ?? 0;
    const internal = new AbortController();
    const signal = opts.signal
      ? AbortSignal.any([opts.signal, internal.signal])
      : internal.signal;

    const POLL_INTERVAL_MS = 250;
    const SETTLE_MS = 150;
    const READ_SIZE = 64 * 1024;

    let terminated = false;
    let lastOffset = fromOffset;

    const pollTimer = setInterval(async () => {
      if (terminated || signal.aborted) return;
      let dead = false;
      try {
        dead = await this.client.paneDead(sessionId);
      } catch (err) {
        if (err instanceof TmuxNoSuchSessionError) {
          dead = true;
        } else {
          return;
        }
      }
      if (dead && !terminated) {
        terminated = true;
        internal.abort();
      }
    }, POLL_INTERVAL_MS);

    try {
      for await (const chunk of followLog(logPath, fromOffset, signal)) {
        lastOffset = chunk.offset + chunk.bytes.byteLength;
        yield { sessionId, offset: chunk.offset, bytes: chunk.bytes };
      }
    } finally {
      clearInterval(pollTimer);
      internal.abort();
    }

    if (!terminated || opts.signal?.aborted) return;

    await this.client.pipePaneOff(sessionId).catch((err) => {
      if (err instanceof TmuxNoSuchSessionError) return;
      throw err;
    });

    await new Promise<void>((r) => setTimeout(r, SETTLE_MS));

    const handle = await open(logPath, "r").catch(() => null);
    if (handle === null) return;
    try {
      const stat = await handle.stat();
      const finalSize = stat.size;
      let readOffset = lastOffset;
      while (readOffset < finalSize) {
        const toRead = Math.min(READ_SIZE, finalSize - readOffset);
        const buf = Buffer.allocUnsafe(toRead);
        const { bytesRead } = await handle.read(buf, 0, toRead, readOffset);
        if (bytesRead === 0) break;
        yield { sessionId, offset: readOffset, bytes: new Uint8Array(buf.buffer, buf.byteOffset, bytesRead) };
        readOffset += bytesRead;
      }
    } finally {
      await handle.close();
    }
  }
}
