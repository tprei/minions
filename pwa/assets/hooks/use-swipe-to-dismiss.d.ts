export interface SwipeToDismissOptions {
  direction?: 'down' | 'right';
  threshold?: number;
  onDismiss?: () => void;
}

export interface SwipeToDismissHandle {
  destroy(): void;
}

export declare function attachSwipeToDismiss(
  panel: HTMLElement,
  options?: SwipeToDismissOptions,
): SwipeToDismissHandle;
