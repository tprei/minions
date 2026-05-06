export type WorkflowKind =
  | "single-task"
  | "think-thread"
  | "ship"
  | "variant-race"
  | "loop"
  | "manual-dag"
  | "ci-heal"
  | "merge-review"
  | "restack";

export type WorkflowStatus = "active" | "completed" | "failed" | "cancelled";

export type TaskExecutionStatus =
  | "pending"
  | "ready"
  | "running"
  | "completed"
  | "finalizing"
  | "quality-pending"
  | "ci-pending"
  | "pr-open"
  | "landed"
  | "merged"
  | "failed"
  | "cancelled"
  | "needs-review";

export type TaskStackStatus =
  | "clean"
  | "restack-pending"
  | "restacking"
  | "restack-conflict"
  | "stale-artifacts";

export type ClaimMode = "read" | "write";

export interface Claim {
  // repo-relative POSIX path, no leading "./" and no trailing "/"
  scope: string;
  mode: ClaimMode;
}

export interface Contract {
  summary: string;
  expectedArtifacts: string[];
}

export type ArtifactKind = "branch" | "commit" | "patch" | "pr" | "quality-report" | "ci-report";

export interface Artifact {
  kind: ArtifactKind;
  ref: string;
  producedBy: string;
  createdAt: string;
}

export type Readiness = "unknown" | "ready" | "blocked";

export interface TaskNode {
  id: string;
  workflowId: string;
  title: string;
  prompt: string;
  parentId?: string;
  dependsOn: string[];
  executionStatus: TaskExecutionStatus;
  stackStatus: TaskStackStatus;
  priority: number;
  claims: Claim[];
  contract: Contract;
  artifacts: Artifact[];
  sessionId?: string;
  workspaceId?: string;
  mergeTarget?: string;
  readiness: Readiness;
  stackPosition: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type GraphOperationKind = "restack";

export type GraphOperationStatus = "pending" | "running" | "completed" | "conflict" | "failed";

export interface GraphOperation {
  id: string;
  workflowId: string;
  kind: GraphOperationKind;
  targetNodeId: string;
  affectedNodeIds: string[];
  fromBase?: string;
  toBase?: string;
  status: GraphOperationStatus;
  attempt: number;
  idempotencyKey: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowPolicy {
  maxConcurrent: number;
}

export interface Workflow {
  id: string;
  kind: WorkflowKind;
  status: WorkflowStatus;
  directorSessionId?: string;
  graph: Record<string, TaskNode>;
  operations: Record<string, GraphOperation>;
  policy: WorkflowPolicy;
  createdFrom?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export const TASK_SUCCESS_EXECUTION_STATUSES: ReadonlySet<TaskExecutionStatus> = new Set([
  "completed",
  "pr-open",
  "landed",
  "merged",
]);

export const TASK_ACTIVE_EXECUTION_STATUSES: ReadonlySet<TaskExecutionStatus> = new Set([
  "ready",
  "running",
  "finalizing",
  "quality-pending",
  "ci-pending",
]);

export const TASK_RUNTIME_ACTIVE_STATUSES: ReadonlySet<TaskExecutionStatus> = new Set([
  "ready",
  "running",
  "finalizing",
]);

export const TASK_TERMINAL_EXECUTION_STATUSES: ReadonlySet<TaskExecutionStatus> = new Set([
  "completed",
  "pr-open",
  "landed",
  "merged",
  "failed",
  "cancelled",
  "needs-review",
]);

export interface TaskSpec {
  id: string;
  title: string;
  prompt: string;
  dependsOn?: string[];
  claims?: Claim[];
  contract?: Partial<Contract>;
  priority?: number;
  mergeTarget?: string;
  stackPosition?: number;
}

export interface WorkflowSpec {
  id: string;
  kind: WorkflowKind;
  tasks: TaskSpec[];
  policy?: Partial<WorkflowPolicy>;
  directorSessionId?: string;
  createdFrom?: string;
}
