export interface ChecksPanelResult {
  element: HTMLElement;
  refresh(): void;
  destroy(): void;
}

export declare function createChecksPanel(opts: {
  prDetail: Record<string, unknown>;
  githubProxy: string;
}): ChecksPanelResult;
