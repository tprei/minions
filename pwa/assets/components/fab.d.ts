export interface FabOptions {
  label?: string;
  icon?: string;
  onClick?: () => void;
}

export interface FabInstance {
  element: HTMLButtonElement;
}

export declare function createFab(options?: FabOptions): FabInstance;
