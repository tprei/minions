export interface TranscriptPipelineContext {
  workflowId?: string;
  taskId?: string;
}

export interface TranscriptPipeline {
  appendEvent(event: Record<string, unknown>): void;
  reset(): void;
  setOnApprovalChange(fn: ((event: Record<string, unknown> | null) => void) | null): void;
  getPendingApproval(): HTMLElement | null;
}

export declare function createTranscriptPipeline(scrollerEl: HTMLElement, ctx?: TranscriptPipelineContext): TranscriptPipeline;
