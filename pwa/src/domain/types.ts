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

export type WorkflowStatus = "active" | "completed" | "failed" | "cancelled";
