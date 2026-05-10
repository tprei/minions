import type { ReactElement, ReactNode } from "react";
import { cx } from "../util/cx";

type PillTone = "info" | "warn" | "err" | "ok" | "neutral";

interface PillProps {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
}

const toneClass: Record<PillTone, string> = {
  info: "bg-tone-info-bg border border-tone-info-border text-tone-info-fg",
  warn: "bg-tone-warn-bg border border-tone-warn-border text-tone-warn-fg",
  err: "bg-tone-err-bg border border-tone-err-border text-tone-err-fg",
  ok: "bg-tone-ok-bg border border-tone-ok-border text-tone-ok-fg",
  neutral: "bg-bg-elev border border-border text-fg-muted",
};

export function Pill({ children, tone = "neutral", className }: PillProps): ReactElement {
  return (
    <span className={cx("pill", toneClass[tone], className)}>
      {children}
    </span>
  );
}
