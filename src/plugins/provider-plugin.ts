import type { Artifact } from "../domain/types.js";

export interface ProviderPrepareSpec {
  taskId: string;
  workflowId: string;
  prompt: string;
  dependencyArtifacts: Artifact[];
}

export interface ProviderInvocation {
  command: string[];
  env?: Record<string, string>;
}

export type ProviderEvent =
  | { kind: "output"; chunk: Uint8Array }
  | { kind: "done"; exitCode: number };

export interface ProviderPlugin {
  name: string;
  prepare(spec: ProviderPrepareSpec): Promise<ProviderInvocation>;
  parseOutput(event: ProviderEvent): Artifact | undefined;
}
