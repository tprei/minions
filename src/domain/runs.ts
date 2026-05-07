export type NodeRunTerminalReason =
  | "completed"
  | "failed"
  | "cancelled"
  | "recovered"
  | "timeout"
  | "interrupted";

export interface NodeRun {
  id: string;
  taskId: string;
  attempt: number;
  providerType: string;
  runtimeType: string;
  runtimeSessionId: string;
  providerSessionRef?: string;
  outputOffset?: number;
  startedAt: string;
  endedAt?: string;
  terminalReason?: NodeRunTerminalReason;
  exitMetadata?: Record<string, unknown>;
}

export function appendRun(runs: NodeRun[], run: NodeRun): NodeRun[] {
  return [...runs, run];
}

export function closeLatestRun(
  runs: NodeRun[],
  terminalReason: NodeRunTerminalReason,
  endedAt: string,
): NodeRun[] {
  const openIndex = [...runs].reverse().findIndex((r) => r.endedAt === undefined);
  if (openIndex === -1) return runs;

  const realIndex = runs.length - 1 - openIndex;
  const run = runs[realIndex];
  if (!run) return runs;

  const closed: NodeRun = { ...run, endedAt, terminalReason };
  return [...runs.slice(0, realIndex), closed, ...runs.slice(realIndex + 1)];
}

export function patchOpenRun(
  runs: NodeRun[],
  patch: { providerSessionRef?: string; outputOffset?: number },
): NodeRun[] {
  const openIndex = [...runs].reverse().findIndex((r) => r.endedAt === undefined);
  if (openIndex === -1) throw new Error("no open run to patch");

  const realIndex = runs.length - 1 - openIndex;
  const run = runs[realIndex];
  if (!run) throw new Error("no open run to patch");

  const patched: NodeRun = { ...run, ...patch };
  return [...runs.slice(0, realIndex), patched, ...runs.slice(realIndex + 1)];
}
