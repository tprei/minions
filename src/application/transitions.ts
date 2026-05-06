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

interface TransitionEffect {
  patch: Partial<TaskNode>;
  clearSession?: boolean;
}

interface TransitionRule {
  from: TaskExecutionStatus[];
  apply: (task: TaskNode, command: TransitionCommand) => TransitionEffect;
}

const appendArtifacts = (task: TaskNode, command: TransitionCommand): Artifact[] => [
  ...task.artifacts,
  ...(command.artifacts ?? []),
];

const TRANSITIONS: Record<TransitionKind, TransitionRule> = {
  "mark-ready": {
    from: ["pending"],
    apply: () => ({ patch: { executionStatus: "ready" } }),
  },
  "mark-running": {
    from: ["ready"],
    apply: (task, command) => {
      if (!command.sessionId) {
        throw new DomainError("invalid_transition", "running task requires session id", {
          taskId: task.id,
        });
      }
      return { patch: { executionStatus: "running", sessionId: command.sessionId } };
    },
  },
  "complete-runtime": {
    from: ["running"],
    apply: (task, command) => ({
      patch: { executionStatus: "completed", artifacts: appendArtifacts(task, command) },
    }),
  },
  "start-finalization": {
    from: ["completed"],
    apply: () => ({ patch: { executionStatus: "finalizing" } }),
  },
  "open-review": {
    from: ["finalizing"],
    apply: (task, command) => ({
      patch: { executionStatus: "pr-open", artifacts: appendArtifacts(task, command) },
    }),
  },
  "start-quality-gate": {
    from: ["completed", "finalizing"],
    apply: () => ({ patch: { executionStatus: "quality-pending" } }),
  },
  "complete-quality-gate": {
    from: ["quality-pending"],
    apply: (task, command) => ({
      patch: {
        executionStatus: command.passed === false ? "needs-review" : "finalizing",
        artifacts: appendArtifacts(task, command),
      },
    }),
  },
  "start-ci-gate": {
    from: ["pr-open"],
    apply: () => ({ patch: { executionStatus: "ci-pending" } }),
  },
  "complete-ci-gate": {
    from: ["ci-pending"],
    apply: (task, command) => ({
      patch: { executionStatus: "pr-open", artifacts: appendArtifacts(task, command) },
    }),
  },
  "merge-task": {
    from: ["pr-open"],
    apply: () => ({ patch: { executionStatus: "merged" } }),
  },
  "cancel-task": {
    from: ["pending", "ready", "running", "finalizing", "quality-pending", "ci-pending"],
    apply: () => ({ patch: { executionStatus: "cancelled" } }),
  },
  "recover-task": {
    from: ["ready", "running", "quality-pending", "ci-pending"],
    apply: (task) => ({
      patch: { executionStatus: task.artifacts.length > 0 ? "needs-review" : "pending" },
      clearSession: true,
    }),
  },
  "fail-task": {
    from: ["pending", "ready", "running", "finalizing", "quality-pending", "ci-pending"],
    apply: () => ({ patch: { executionStatus: "failed" } }),
  },
};

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

  const rule = TRANSITIONS[command.kind];
  if (!rule.from.includes(task.executionStatus)) {
    throw new DomainError("invalid_transition", "task status does not allow transition", {
      taskId: task.id,
      kind: command.kind,
      status: task.executionStatus,
      allowed: rule.from,
    });
  }

  const effect = rule.apply(task, command);
  const next = updateTask(task, command, effect);
  const graph = { ...workflow.graph, [task.id]: next };

  return {
    ...workflow,
    graph,
    status: deriveWorkflowStatus(graph),
    version: workflow.version + 1,
    updatedAt: command.now,
  };
}

function updateTask(task: TaskNode, command: TransitionCommand, effect: TransitionEffect): TaskNode {
  const updated: TaskNode = {
    ...task,
    ...effect.patch,
    version: task.version + 1,
    updatedAt: command.now,
  };

  if (effect.clearSession) delete updated.sessionId;

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
