export interface UsageEvent {
  kind: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
}

export interface CostBadgeInstance {
  element: HTMLElement;
  handleUsageEvent(event: UsageEvent): void;
  destroy(): void;
}

export declare function createCostBadge(options?: {
  onUsageEvent?: (handler: (event: UsageEvent) => void) => void;
}): CostBadgeInstance;
