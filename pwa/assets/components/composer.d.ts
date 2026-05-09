export type ComposerMode = "idle" | "running" | "feedback" | "disabled" | "approval";

export interface ComposerInstance {
  element: HTMLElement;
  setMode(mode: ComposerMode): void;
  getValue(): string;
  setValue(v: string): void;
  onInput(handler: (value: string) => void): () => void;
  setApprovalHandlers(handlers: { onApprove: () => void; onDeny: () => void } | null): void;
}

export interface ComposerOptions {
  mode?: ComposerMode;
  taskId: string;
  workflowId: string;
  onSubmit?: (value: string, mode: ComposerMode) => void;
}

export declare function createComposer(options: ComposerOptions): ComposerInstance;
