export interface ActivityTabDeps {
  apiBase?: string;
}

export interface ActivityTab {
  element: HTMLElement;
}

export declare function createActivityTab(deps?: ActivityTabDeps): ActivityTab;
