export interface DraftState {
  readonly value: string;
  setValue(v: string): void;
  clear(): void;
  subscribe(handler: (v: string) => void): () => void;
}

export declare function useDraftState(taskId: string, workflowId: string): DraftState;
export declare function clearAllDrafts(workflowId: string): void;
