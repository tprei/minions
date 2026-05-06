import type { TaskNode, Workflow } from "../domain/types.js";

export type RuntimeProbeState = "live" | "dead" | "missing";

export type RecoveryActionKind =
  | "recover-task"
  | "probe-gate"
  | "stop-runtime"
  | "operator-review"
  | "resume-graph-operation";

export type RecoveryAction = TaskRecoveryAction | GraphOperationRecoveryAction;

export interface TaskRecoveryAction {
  kind: Exclude<RecoveryActionKind, "resume-graph-operation">;
  taskId: string;
  reason: string;
  sessionId?: string;
}

export interface GraphOperationRecoveryAction {
  kind: "resume-graph-operation";
  operationId: string;
  reason: string;
}

export interface RecoveryOptions {
  nowMs: number;
  staleReadyMs: number;
  staleGateMs: number;
  runtimeProbes?: Record<string, RuntimeProbeState>;
  workflowCancelled?: boolean;
}

export function planRecovery(workflow: Workflow, options: RecoveryOptions): RecoveryAction[] {
  const actions: RecoveryAction[] = [];

  for (const task of Object.values(workflow.graph)) {
    if (options.workflowCancelled && task.sessionId) {
      actions.push({
        kind: "stop-runtime",
        taskId: task.id,
        sessionId: task.sessionId,
        reason: "workflow cancelled with live runtime",
      });
      continue;
    }

    if (
      task.executionStatus === "ready" &&
      !task.sessionId &&
      ageMs(task, options.nowMs) >= options.staleReadyMs
    ) {
      actions.push({ kind: "recover-task", taskId: task.id, reason: "stale ready task" });
      continue;
    }

    if (task.executionStatus === "running" && !task.sessionId) {
      actions.push({ kind: "recover-task", taskId: task.id, reason: "running task has no session" });
      continue;
    }

    if (task.executionStatus === "running" && task.sessionId) {
      const probe = options.runtimeProbes?.[task.sessionId];
      if (probe === "dead" || probe === "missing") {
        actions.push({
          kind: "recover-task",
          taskId: task.id,
          sessionId: task.sessionId,
          reason: `runtime probe is ${probe}`,
        });
        continue;
      }
    }

    if (
      (task.executionStatus === "quality-pending" || task.executionStatus === "ci-pending") &&
      ageMs(task, options.nowMs) >= options.staleGateMs
    ) {
      actions.push({
        kind: "probe-gate",
        taskId: task.id,
        reason: `${task.executionStatus} timed out`,
      });
    }
  }

  for (const operation of Object.values(workflow.operations)) {
    if (operation.status === "pending" || operation.status === "running") {
      actions.push({
        kind: "resume-graph-operation",
        operationId: operation.id,
        reason: `${operation.kind} operation is ${operation.status}`,
      });
    }
  }

  return actions;
}

function ageMs(task: TaskNode, nowMs: number): number {
  return nowMs - new Date(task.updatedAt).getTime();
}
