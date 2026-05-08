function costTier(costUsd) {
  if (costUsd < 0.01) return "green";
  if (costUsd < 0.10) return "yellow";
  if (costUsd < 1.00) return "orange";
  return "red";
}

export function render(event) {
  const el = document.createElement("div");
  el.className = "te te-usage";

  const pill = document.createElement("span");
  pill.className = "te-usage-pill";

  if (typeof event.costUsd === "number") {
    const tier = costTier(event.costUsd);
    pill.className += ` te-usage-tier-${tier}`;
    pill.dataset.costTier = tier;
    pill.textContent = `$${event.costUsd.toFixed(4)}`;
  } else {
    pill.className += " te-usage-tier-tokens";
    const input = event.inputTokens ?? 0;
    const output = event.outputTokens ?? 0;
    const cached = event.cachedInputTokens ?? 0;
    const reasoning = event.reasoningTokens ?? 0;
    const parts = [`in:${input}`, `out:${output}`];
    if (cached > 0) parts.push(`cached:${cached}`);
    if (reasoning > 0) parts.push(`reasoning:${reasoning}`);
    pill.textContent = parts.join(" ");
  }

  el.appendChild(pill);
  return el;
}
