export type WorkspaceMode = "worktree" | "existing";

export interface WorkspaceCreateSpec {
  workflowId: string;
  taskId: string;
  branch: string;
  baseRef?: string;
  mode?: WorkspaceMode;
}

export interface WorkspaceHandle {
  workspaceId: string;
  mode: WorkspaceMode;
  path: string;
  containerPath: string;
  branch: string;
}

export interface WorkspaceBackend {
  create(spec: WorkspaceCreateSpec): Promise<WorkspaceHandle>;
  cleanup(workspaceId: string): Promise<void>;
}

export class WorkspaceError extends Error {
  constructor(
    public code: "path_escape" | "git_failed" | "not_found" | "lock_timeout",
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}

export function slugify(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "");
}
