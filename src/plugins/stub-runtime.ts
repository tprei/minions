import type { RuntimeProbeState } from "../application/recovery.js";
import type { RuntimeBackend, RuntimeStartResult, RuntimeStartSpec } from "./runtime-backend.js";

export class StubRuntimeBackend implements RuntimeBackend {
  private counter = 0;
  private readonly sessions = new Set<string>();

  async start(spec: RuntimeStartSpec): Promise<RuntimeStartResult> {
    void spec;
    this.counter += 1;
    const sessionId = `stub-${this.counter}`;
    this.sessions.add(sessionId);
    return { sessionId, runtimeType: "stub" };
  }

  async stop(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async probe(sessionId: string): Promise<RuntimeProbeState> {
    return this.sessions.has(sessionId) ? "live" : "missing";
  }

  attach(_sessionId: string): AsyncIterable<Uint8Array> {
    return {
      [Symbol.asyncIterator]: async function* () {},
    };
  }
}
