const PROVIDER_MAP = {
  'claude-code': { hue: 210, accent: '#3b82f6', icon: '◆' },
  'codex':       { hue: 270, accent: '#a855f7', icon: '◇' },
  'stub':        { hue: 0,   accent: '#9ca3af', icon: '○' },
};

const FALLBACK = { hue: 0, accent: '#9ca3af', icon: '○' };

export function agentColor(providerName) {
  return PROVIDER_MAP[providerName] ?? FALLBACK;
}
