import { cityAlias } from "./cityAlias";

export type AgentColorTone = "blue" | "purple" | "grey";

const PROVIDER_TONE: Record<string, AgentColorTone> = {
  "claude-code": "blue",
  codex: "purple",
  stub: "grey",
};

export function agentTone(providerType: string): AgentColorTone {
  return PROVIDER_TONE[providerType] ?? "grey";
}

export interface AgentIdentity {
  tone: AgentColorTone;
  alias: string;
}

export function agentIdentity(providerType: string, sessionId: string): AgentIdentity {
  return {
    tone: agentTone(providerType),
    alias: cityAlias(sessionId),
  };
}

const TONE_RING: Record<AgentColorTone, string> = {
  blue: "ring-blue-400",
  purple: "ring-purple-400",
  grey: "ring-fg-subtle",
};

export function agentRingClass(tone: AgentColorTone): string {
  return TONE_RING[tone];
}
