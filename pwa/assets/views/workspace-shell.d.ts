export interface WorkspaceShellInstance {
  element: HTMLElement;
  destroy(): void;
  setExecutionStatus(status: string): void;
  setArtifacts(artifacts: Array<{ kind: string; url?: string }>): void;
  appendTranscriptEvent(payload: unknown): void;
}

export interface WorkspaceShellOptions {
  workflowId: string;
  taskId: string;
  eventBus: null | {
    on?: (kind: string, handler: (ev: { payload: Record<string, unknown> }) => void) => (() => void) | undefined;
  };
}

export declare function createWorkspaceShell(options: WorkspaceShellOptions): WorkspaceShellInstance;
