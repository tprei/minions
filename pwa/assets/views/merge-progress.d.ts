export interface MergeProgressResult {
  element: HTMLElement;
  destroy(): void;
  onMergePhase(event: {
    payload?: { taskId: string; phase: string; status: string; error?: string };
    taskId?: string;
    phase?: string;
    status?: string;
    error?: string;
  }): void;
}

export declare function createMergeProgress(
  taskId: string,
  eventBus?: { on?: (event: string, handler: (e: unknown) => void) => (() => void) | undefined } | null,
): MergeProgressResult;
