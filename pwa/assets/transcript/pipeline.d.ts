export interface TranscriptPipeline {
  appendEvent(event: Record<string, unknown>): void;
  reset(): void;
}

export declare function createTranscriptPipeline(scrollerEl: HTMLElement): TranscriptPipeline;
