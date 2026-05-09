export interface AgentColorResult {
  hue: number;
  accent: string;
  icon: string;
}

export declare function agentColor(providerName: string): AgentColorResult;
