// ── Workflow ──────────────────────────────────────────────────────────────────

export type WorkflowKind =
  | "single-task"
  | "think-thread"
  | "ship"
  | "variant-race"
  | "loop"
  | "manual-dag"
  | "ci-heal"
  | "merge-review";

export type WorkflowStatus = "active" | "completed" | "failed" | "cancelled";

export interface WorkflowPolicy {
  maxConcurrent: number;
  autoLand: boolean;
  autoMergeOnGreen: boolean;
}

export interface WorkflowSummary {
  id: string;
  kind: WorkflowKind;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
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

// ── Task ──────────────────────────────────────────────────────────────────────

export type TaskExecutionStatus =
  | "pending"
  | "ready"
  | "running"
  | "completed"
  | "finalizing"
  | "quality-pending"
  | "ci-pending"
  | "pr-open"
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
  runs: NodeRun[];
  readiness: Readiness;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ── Graph operations ──────────────────────────────────────────────────────────

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

// ── Workflow spec (create) ────────────────────────────────────────────────────

export interface TaskSpec {
  id: string;
  title: string;
  prompt: string;
  dependsOn?: string[];
  claims?: Claim[];
  contract?: Partial<Contract>;
  priority?: number;
  mergeTarget?: string;
}

export interface WorkflowSpec {
  id: string;
  kind: WorkflowKind;
  tasks: TaskSpec[];
  policy?: Partial<WorkflowPolicy>;
  directorSessionId?: string;
  createdFrom?: string;
}

// ── Events ────────────────────────────────────────────────────────────────────

export type WorkflowEventKind =
  | "task-transitioned"
  | "graph-operation-changed"
  | "run-started"
  | "run-ended"
  | "workflow-status-changed"
  | "provider-event"
  | "merge-phase";

export interface TaskTransitionedPayload {
  taskId: string;
  fromExecutionStatus: TaskExecutionStatus;
  toExecutionStatus: TaskExecutionStatus;
  fromStackStatus: TaskStackStatus;
  toStackStatus: TaskStackStatus;
  taskVersion: number;
}

export interface GraphOperationChangedPayload {
  operationId: string;
  kind: GraphOperationKind;
  fromStatus: GraphOperationStatus | null;
  toStatus: GraphOperationStatus;
}

export interface RunStartedPayload {
  runId: string;
  taskId: string;
  attempt: number;
  runtimeSessionId: string;
  providerSessionRef?: string;
  providerType: string;
  runtimeType: string;
}

export interface RunEndedPayload {
  runId: string;
  taskId: string;
  attempt: number;
  terminalReason: NodeRunTerminalReason;
  providerSessionRef?: string;
}

export interface WorkflowStatusChangedPayload {
  fromStatus: WorkflowStatus;
  toStatus: WorkflowStatus;
}

export interface ProviderEventPayload {
  taskId: string;
  runId: string;
  providerEvent: unknown;
}

export type MergePhase = "prepareMerge" | "commit" | "squash" | "rebase" | "applyMerge" | "finalize";

export interface MergePhasePayload {
  taskId: string;
  phase: MergePhase;
  status: "started" | "completed";
  error?: string;
}

interface EventBase {
  cursor: number;
  workflowId: string;
  occurredAt: string;
}

export type WorkflowEvent = EventBase &
  (
    | { kind: "task-transitioned"; payload: TaskTransitionedPayload }
    | { kind: "graph-operation-changed"; payload: GraphOperationChangedPayload }
    | { kind: "run-started"; payload: RunStartedPayload }
    | { kind: "run-ended"; payload: RunEndedPayload }
    | { kind: "workflow-status-changed"; payload: WorkflowStatusChangedPayload }
    | { kind: "provider-event"; payload: ProviderEventPayload }
    | { kind: "merge-phase"; payload: MergePhasePayload }
  );

// ── Supervisor / alert ────────────────────────────────────────────────────────

export type AlertKind =
  | "merge-inconsistent"
  | "push-failures-spike"
  | "boot-recovery-failed"
  | "orchestrator-silent"
  | "ci-exhausted";

export type AlertSeverity = "warn" | "error";

export interface Alert {
  id: string;
  timestamp: string;
  kind: AlertKind;
  severity: AlertSeverity;
  message: string;
  workflowId?: string;
  taskId?: string;
  detail?: Record<string, unknown>;
  acknowledgedAt?: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  workflowId?: string;
  taskId?: string;
  targetKind?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export interface ContinueTaskAttachment {
  kind: "comment";
  path: string;
  line: number;
  body: string;
}

export type Command =
  | { kind: "transition-task"; workflowId: string; transition: { kind: string; taskId: string; now: string } }
  | { kind: "request-restack"; workflowId: string; input: { operationId: string; ancestorId: string; idempotencyKey: string; now: string } }
  | { kind: "start-restack"; workflowId: string; operationId: string; now: string }
  | { kind: "complete-restack"; workflowId: string; input: { operationId: string; artifactsByTaskId?: Record<string, unknown>; now: string } }
  | { kind: "mark-restack-conflict"; workflowId: string; operationId: string; error: string; now: string }
  | { kind: "continue-task"; workflowId: string; taskId: string; prompt: string; attachments?: ContinueTaskAttachment[] }
  | { kind: "retry-task"; workflowId: string; taskId: string; prompt: string }
  | { kind: "approve-permission"; workflowId: string; taskId: string; requestId: string; decision: "approve" | "deny"; reason?: string };
