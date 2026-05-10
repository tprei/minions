import type {
  Alert,
  AuditEvent,
  Command,
  Workflow,
  WorkflowSpec,
  WorkflowSummary,
} from "../domain/types";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
    ...init,
  });
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    throw new RestError(res.status, body);
  }
  return res.json() as Promise<T>;
}

export function listWorkflows(): Promise<WorkflowSummary[]> {
  return request<WorkflowSummary[]>("/workflows");
}

export function getWorkflow(id: string): Promise<Workflow> {
  return request<Workflow>(`/workflows/${encodeURIComponent(id)}`);
}

export function createWorkflow(spec: WorkflowSpec): Promise<{ id: string }> {
  return request<{ id: string }>("/workflows", {
    method: "POST",
    body: JSON.stringify(spec),
  });
}

export function postCommand(cmd: Command): Promise<void> {
  return request<void>("/commands", {
    method: "POST",
    body: JSON.stringify(cmd),
  });
}

export function mergeTask(workflowId: string, taskId: string): Promise<void> {
  return request<void>(
    `/workflows/${encodeURIComponent(workflowId)}/tasks/${encodeURIComponent(taskId)}/merge`,
    { method: "POST" },
  );
}

export function draftPr(workflowId: string, taskId: string): Promise<void> {
  return request<void>(
    `/workflows/${encodeURIComponent(workflowId)}/tasks/${encodeURIComponent(taskId)}/draft-pr`,
    { method: "POST" },
  );
}

export function listAuditEvents(opts?: {
  limit?: number;
  beforeTs?: string;
  action?: string;
  workflowId?: string;
}): Promise<AuditEvent[]> {
  const params = new URLSearchParams();
  if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts?.beforeTs !== undefined) params.set("beforeTs", opts.beforeTs);
  if (opts?.action !== undefined) params.set("action", opts.action);
  if (opts?.workflowId !== undefined) params.set("workflowId", opts.workflowId);
  const qs = params.toString();
  return request<{ events: AuditEvent[] }>(`/audit/events${qs ? `?${qs}` : ""}`).then(
    (r) => r.events,
  );
}

export function getWorkflowAudit(id: string): Promise<AuditEvent[]> {
  return request<{ events: AuditEvent[] }>(
    `/audit/workflows/${encodeURIComponent(id)}`,
  ).then((r) => r.events);
}

export function listAlerts(): Promise<Alert[]> {
  return request<{ alerts: Alert[] }>("/alerts").then((r) => r.alerts);
}

export function getPrDetail(url: string): Promise<unknown> {
  return request<unknown>(`/github/pr-detail?url=${encodeURIComponent(url)}`);
}
