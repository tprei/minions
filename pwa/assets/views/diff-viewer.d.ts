export interface DiffViewerResult {
  element: HTMLElement;
  destroy(): void;
  getSelectedRange(): { start: number; end: number } | null;
}

export declare function createDiffViewer(opts: {
  prDetail: Record<string, unknown>;
  files: unknown[];
}): DiffViewerResult;
