export interface DraftPrPanelInstance {
  element: HTMLElement;
  fetch(): void;
  cancel(): void;
  destroy(): void;
}

export interface DraftPrPanelOptions {
  workflowId: string;
  taskId: string;
  onDraft?: (draft: { title: string; body: string }) => void;
}

export declare function createDraftPrPanel(options: DraftPrPanelOptions): DraftPrPanelInstance;
