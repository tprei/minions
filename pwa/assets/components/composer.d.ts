export type ComposerMode = "idle" | "running" | "feedback" | "disabled";

export interface CommentAttachment {
  kind: "comment";
  path: string;
  line: number;
  body: string;
}

export interface ComposerInstance {
  element: HTMLElement;
  setMode(mode: ComposerMode): void;
  getValue(): string;
  setValue(v: string): void;
  setAttachments(attachments: CommentAttachment[]): void;
  getAttachments(): CommentAttachment[];
  onCommentJump(cb: (attachment: CommentAttachment) => void): () => void;
}

export interface ComposerOptions {
  mode?: ComposerMode;
  taskId: string;
  workflowId: string;
  onSubmit?: (value: string, mode: ComposerMode, attachments?: CommentAttachment[]) => void;
}

export declare function createComposer(options: ComposerOptions): ComposerInstance;
