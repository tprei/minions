export interface WorkspaceShellInstance {
  element: HTMLElement;
  destroy(): void;
  setExecutionStatus(status: string): void;
  setArtifacts(
    artifacts: Array<{ kind: string; ref?: string; producedBy?: string; createdAt?: string }>,
    task?: Record<string, unknown> | null,
    workflow?: Record<string, unknown> | null,
  ): void;
  appendTranscriptEvent(payload: unknown): void;
  recordUsage(event: { kind: string; costUsd?: number; [key: string]: unknown }): void;
}

export interface WorkspaceShellOptions {
  workflowId: string;
  taskId: string;
  eventBus: null | {
    on?: (kind: string, handler: (ev: { payload: Record<string, unknown> }) => void) => (() => void) | undefined;
  };
  task?: Record<string, unknown> | null;
  workflow?: Record<string, unknown> | null;
}

export declare function createWorkspaceShell(options: WorkspaceShellOptions): WorkspaceShellInstance;
