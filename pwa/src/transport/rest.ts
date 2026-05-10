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

export interface WorkflowSummary {
  id: string;
  kind: WorkflowKind;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
}

export class RestError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`);
    this.name = "RestError";
    this.status = status;
    this.body = body;
  }
}

export async function listWorkflows(): Promise<WorkflowSummary[]> {
  const res = await fetch("/workflows");
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    throw new RestError(res.status, body);
  }
  return res.json() as Promise<WorkflowSummary[]>;
}
