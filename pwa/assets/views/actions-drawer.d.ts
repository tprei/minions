export interface ActionItem {
  label: string;
  icon?: string;
  onClick?: () => void;
}

export interface ActionsDrawerInstance {
  element: HTMLElement;
  open(): void;
  close(): void;
  destroy(): void;
}

export interface DefaultActionsDrawerOptions {
  onSwitchView?: () => void;
  onToggleTheme?: () => void;
}

export declare function createActionsDrawer(options?: { actions?: ActionItem[] }): ActionsDrawerInstance;
export declare function createDefaultActionsDrawer(options?: DefaultActionsDrawerOptions): ActionsDrawerInstance;
