export interface WorkspaceCreateSpec {
  workflowId: string;
  taskId: string;
  repoUrl: string;
  branch: string;
}

export interface WorkspaceHandle {
  workspaceId: string;
  path: string;
}

export interface WorkspaceBackend {
  create(spec: WorkspaceCreateSpec): Promise<WorkspaceHandle>;
  cleanup(workspaceId: string): Promise<void>;
}
