import { cx } from "../../util/cx";
import { Pill } from "../../components/Pill";

type CostTier = "ok" | "warn" | "err" | "neutral";

function costTier(costUsd: number): CostTier {
  if (costUsd < 0.01) return "ok";
  if (costUsd < 0.10) return "warn";
  if (costUsd < 1.00) return "err";
  return "err";
}

interface Props {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
}

export function Usage({ inputTokens, outputTokens, cachedInputTokens, reasoningTokens, costUsd }: Props): JSX.Element {
  let label: string;
  let tone: CostTier;

  if (typeof costUsd === "number") {
    tone = costTier(costUsd);
    label = `$${costUsd.toFixed(4)}`;
  } else {
    tone = "neutral";
    const parts = [`in:${inputTokens}`, `out:${outputTokens}`];
    if (cachedInputTokens !== undefined && cachedInputTokens > 0) parts.push(`cached:${cachedInputTokens}`);
    if (reasoningTokens !== undefined && reasoningTokens > 0) parts.push(`reasoning:${reasoningTokens}`);
    label = parts.join(" ");
  }

  return (
    <div className={cx("te te-usage flex justify-end")}>
      <Pill tone={tone} className="te-usage-pill text-[10px]">
        {label}
      </Pill>
    </div>
  );
}
