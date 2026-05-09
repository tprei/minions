export interface DiffComment {
  kind: "comment";
  path: string;
  line: number;
  body: string;
}

export interface DiffViewerResult {
  element: HTMLElement;
  destroy(): void;
  getSelectedRange(): { start: number; end: number } | null;
  getComments(): DiffComment[];
  onSend(cb: (comments: DiffComment[]) => void): () => void;
}

export declare function createDiffViewer(opts: {
  prDetail: Record<string, unknown>;
  files: unknown[];
}): DiffViewerResult;
