export type ProviderEvent =
  | { kind: "assistant_text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool_call"; id: string; name: string; input: unknown }
  | { kind: "tool_result"; id: string; output: unknown; isError?: boolean }
  | { kind: "permission_request"; id: string; tool: string; input: unknown }
  | { kind: "usage"; inputTokens: number; outputTokens: number; cachedInputTokens?: number; reasoningTokens?: number; costUsd?: number }
  | { kind: "error"; recoverable: boolean; message: string; source?: string }
  | { kind: "final"; sessionRef: string; exitMetadata?: Record<string, unknown> };
