export interface OperationsStripDeps {
  onTaskFocus?: (taskId: string) => void;
}

export interface OperationsStripResult {
  element: HTMLElement;
  update(workflow: unknown): void;
  onGraphOperationChanged(event: unknown): void;
  destroy(): void;
}

export declare function createOperationsStrip(options: {
  workflow: unknown;
  deps: OperationsStripDeps;
}): OperationsStripResult;
