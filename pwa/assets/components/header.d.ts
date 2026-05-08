export declare function createTasksPill(opts?: {
  taskCount?: number;
  hasNonClean?: boolean;
  onClick?: () => void;
}): HTMLButtonElement;

export declare function createAppHeader(opts?: {
  title?: string;
  statusBadgeNode?: HTMLElement | null;
  rightSlot?: HTMLElement | null;
}): HTMLElement;
