export interface ContextMenuItem {
  label: string;
  onClick?: () => void;
}

export interface ContextMenuInstance {
  destroy(): void;
  showMenu(event: PointerEvent | MouseEvent): void;
  closeMenu(): void;
}

export interface KanbanCardContextMenuOptions {
  workflowId: string;
  taskId: string;
  hasPr?: boolean;
  executionStatus?: string;
}

export declare function createContextMenu(options?: {
  target?: HTMLElement;
  items?: ContextMenuItem[];
}): ContextMenuInstance;

export declare function createKanbanCardContextMenu(
  card: HTMLElement,
  options?: KanbanCardContextMenuOptions,
): ContextMenuInstance;
