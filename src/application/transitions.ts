import { DomainError } from "../domain/errors.js";
import type { Artifact, TaskExecutionStatus, TaskNode, Workflow } from "../domain/types.js";
import { TASK_TERMINAL_EXECUTION_STATUSES } from "../domain/types.js";

export type TransitionKind =
  | "mark-ready"
  | "mark-running"
  | "complete-runtime"
  | "start-finalization"
  | "open-review"
  | "start-quality-gate"
  | "complete-quality-gate"
  | "start-ci-gate"
  | "complete-ci-gate"
  | "land-task"
  | "merge-task"
  | "cancel-task"
  | "recover-task"
  | "fail-task";

export interface TransitionCommand {
  kind: TransitionKind;
  taskId: string;
  expectedVersion?: number;
  expectedSessionId?: string;
  sessionId?: string;
  artifacts?: Artifact[];
  passed?: boolean;
  reason?: string;
  now: string;
}

export function transitionTask(workflow: Workflow, command: TransitionCommand): Workflow {
  const task = workflow.graph[command.taskId];
  if (!task) {
    throw new DomainError("not_found", "task not found", { taskId: command.taskId });
  }

  if (command.expectedVersion !== undefined && command.expectedVersion !== task.version) {
    throw new DomainError("version_conflict", "task version does not match", {
      taskId: task.id,
      expectedVersion: command.expectedVersion,
      actualVersion: task.version,
    });
  }

  if (command.expectedSessionId !== undefined && command.expectedSessionId !== task.sessionId) {
    throw new DomainError("invalid_transition", "task session does not match", {
      taskId: task.id,
      expectedSessionId: command.expectedSessionId,
      actualSessionId: task.sessionId,
    });
  }

  const next = applyTaskTransition(task, command);
  const graph = { ...workflow.graph, [task.id]: next };

  return {
    ...workflow,
    graph,
    status: deriveWorkflowStatus(graph),
    version: workflow.version + 1,
    updatedAt: command.now,
  };
}

function applyTaskTransition(task: TaskNode, command: TransitionCommand): TaskNode {
  switch (command.kind) {
    case "mark-ready":
      requireStatus(task, ["pending"]);
      return updateTask(task, command, { executionStatus: "ready" });
    case "mark-running":
      requireStatus(task, ["ready"]);
      if (!command.sessionId) {
        throw new DomainError("invalid_transition", "running task requires session id", {
          taskId: task.id,
        });
      }
      return updateTask(task, command, {
        executionStatus: "running",
        sessionId: command.sessionId,
      });
    case "complete-runtime":
      requireStatus(task, ["running"]);
      return updateTask(task, command, {
        executionStatus: "completed",
        artifacts: [...task.artifacts, ...(command.artifacts ?? [])],
      });
    case "start-finalization":
      requireStatus(task, ["completed"]);
      return updateTask(task, command, { executionStatus: "finalizing" });
    case "open-review":
      requireStatus(task, ["finalizing"]);
      return updateTask(task, command, {
        executionStatus: "pr-open",
        artifacts: [...task.artifacts, ...(command.artifacts ?? [])],
      });
    case "start-quality-gate":
      requireStatus(task, ["completed", "finalizing"]);
      return updateTask(task, command, { executionStatus: "quality-pending" });
    case "complete-quality-gate":
      requireStatus(task, ["quality-pending"]);
      if (command.passed === false) {
        return updateTask(task, command, {
          executionStatus: "needs-review",
          artifacts: [...task.artifacts, ...(command.artifacts ?? [])],
        });
      }
      return updateTask(task, command, {
        executionStatus: "finalizing",
        artifacts: [...task.artifacts, ...(command.artifacts ?? [])],
      });
    case "start-ci-gate":
      requireStatus(task, ["pr-open"]);
      return updateTask(task, command, { executionStatus: "ci-pending" });
    case "complete-ci-gate":
      requireStatus(task, ["ci-pending"]);
      return updateTask(task, command, {
        executionStatus: "pr-open",
        artifacts: [...task.artifacts, ...(command.artifacts ?? [])],
      });
    case "land-task":
      requireStatus(task, ["pr-open", "finalizing"]);
      return updateTask(task, command, { executionStatus: "landed" });
    case "merge-task":
      requireStatus(task, ["landed", "pr-open"]);
      return updateTask(task, command, { executionStatus: "merged" });
    case "cancel-task":
      requireStatus(task, ["pending", "ready", "running", "finalizing", "quality-pending", "ci-pending"]);
      return updateTask(task, command, { executionStatus: "cancelled" });
    case "recover-task":
      requireStatus(task, ["ready", "running", "quality-pending", "ci-pending"]);
      if (task.artifacts.length > 0) {
        return updateTask(task, command, { executionStatus: "needs-review" }, { clearSession: true });
      }
      return updateTask(task, command, { executionStatus: "pending" }, { clearSession: true });
    case "fail-task":
      requireStatus(task, ["pending", "ready", "running", "finalizing", "quality-pending", "ci-pending"]);
      return updateTask(task, command, { executionStatus: "failed" });
  }
}

function requireStatus(task: TaskNode, allowed: TaskExecutionStatus[]): void {
  if (!allowed.includes(task.executionStatus)) {
    throw new DomainError("invalid_transition", "task status does not allow transition", {
      taskId: task.id,
      status: task.executionStatus,
      allowed,
    });
  }
}

function updateTask(
  task: TaskNode,
  command: TransitionCommand,
  patch: Partial<TaskNode>,
  options: { clearSession?: boolean } = {},
): TaskNode {
  const updated: TaskNode = {
    ...task,
    ...patch,
    version: task.version + 1,
    updatedAt: command.now,
  };

  if (options.clearSession) delete updated.sessionId;

  return updated;
}

function deriveWorkflowStatus(graph: Record<string, TaskNode>): Workflow["status"] {
  const tasks = Object.values(graph);
  if (tasks.every((task) => task.executionStatus === "cancelled")) return "cancelled";
  if (tasks.every((task) => TASK_TERMINAL_EXECUTION_STATUSES.has(task.executionStatus))) {
    if (tasks.some((task) => task.executionStatus === "failed")) {
      return "failed";
    }
    return "completed";
  }
  return "active";
}
