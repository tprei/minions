import type { RuntimeProbeState } from "../application/recovery.js";

export interface RuntimeStartSpec {
  taskId: string;
  workflowId: string;
  command: string[];
  env?: Record<string, string>;
  workspacePath?: string;
}

export interface RuntimeStartResult {
  sessionId: string;
  runtimeType: string;
}

export interface RuntimeBackend {
  start(spec: RuntimeStartSpec): Promise<RuntimeStartResult>;
  stop(sessionId: string): Promise<void>;
  probe(sessionId: string): Promise<RuntimeProbeState>;
  attach(sessionId: string): AsyncIterable<Uint8Array>;
}
