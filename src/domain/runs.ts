export type NodeRunTerminalReason = "completed" | "failed" | "cancelled" | "recovered" | "timeout";

export interface NodeRun {
  id: string;
  taskId: string;
  attempt: number;
  providerType: string;
  runtimeType: string;
  sessionId: string;
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
