export interface ActivityTabDeps {
  apiBase?: string;
  workflows?: unknown[];
  onRefresh?: () => unknown[] | Promise<unknown[]>;
}

export interface ActivityTab {
  element: HTMLElement;
  updateWorkflows(workflows: unknown[]): void;
}

export declare function createActivityTab(deps?: ActivityTabDeps): ActivityTab;
