export interface PrTabDeps {
  githubProxy?: string;
  createChecksPanel?: (opts: { prDetail: Record<string, unknown>; githubProxy: string }) => { element: HTMLElement; refresh(): void; destroy(): void };
  createDiffViewer?: (opts: { prDetail: Record<string, unknown>; files: unknown[] }) => { element: HTMLElement; destroy(): void };
  createMergeProgress?: (taskId: string) => { element: HTMLElement; destroy(): void };
}

export interface PrTabResult {
  element: HTMLElement;
  refresh(): void;
  destroy(): void;
}

export declare function createPrTab(opts: {
  task: Record<string, unknown> | null | undefined;
  workflow: Record<string, unknown> | null | undefined;
  deps?: PrTabDeps;
}): PrTabResult;
