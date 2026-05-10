import type { TaskNode, Workflow } from "../domain/types";

const STATUS_ORDER: Record<string, number> = {
  running: 0,
  "quality-pending": 1,
  "ci-pending": 2,
  finalizing: 3,
  "pr-open": 4,
  "needs-review": 5,
  ready: 6,
  pending: 7,
  completed: 8,
  merged: 9,
  failed: 10,
  cancelled: 11,
};

const TERMINAL_STATUSES = new Set(["merged", "cancelled", "failed", "completed"]);

export function pickActiveTask(workflow: Workflow): TaskNode | undefined {
  const tasks = Object.values(workflow.graph);
  if (tasks.length === 0) return undefined;

  const nonTerminal = tasks.filter((t) => !TERMINAL_STATUSES.has(t.executionStatus));
  if (nonTerminal.length > 0) {
    return nonTerminal.sort(
      (a, b) =>
        (STATUS_ORDER[a.executionStatus] ?? 99) - (STATUS_ORDER[b.executionStatus] ?? 99),
    )[0];
  }

  return tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
