export interface AlertCenterDeps {
  apiBase?: string;
}

export interface AlertCenter {
  element: HTMLElement;
  refresh(): Promise<void>;
}

export declare function createAlertCenter(deps?: AlertCenterDeps): AlertCenter;
