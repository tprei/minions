export interface CompletionStepperResult {
  element: HTMLElement;
  update(task: unknown): void;
  onTaskTransitioned(event: unknown): void;
  destroy(): void;
}

export declare function createCompletionStepper(options: {
  task: unknown;
}): CompletionStepperResult;
