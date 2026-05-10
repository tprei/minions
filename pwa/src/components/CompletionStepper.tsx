import type { ReactElement } from "react";
import type { TaskExecutionStatus } from "../domain/types";
import { cx } from "../util/cx";

const STEPS: { status: TaskExecutionStatus; label: string }[] = [
  { status: "finalizing", label: "Finalizing" },
  { status: "pr-open", label: "PR open" },
  { status: "ci-pending", label: "CI" },
  { status: "merged", label: "Merged" },
];

const STEP_ORDER: Record<string, number> = {
  finalizing: 0,
  "pr-open": 1,
  "ci-pending": 2,
  merged: 3,
};

interface CompletionStepperProps {
  executionStatus: TaskExecutionStatus;
}

export function CompletionStepper({ executionStatus }: CompletionStepperProps): ReactElement {
  const current = STEP_ORDER[executionStatus] ?? 0;

  return (
    <div className="flex items-center gap-1 py-1" role="list" aria-label="Completion progress">
      {STEPS.map((step, idx) => {
        const done = idx < current;
        const active = idx === current;
        const future = idx > current;
        return (
          <div key={step.status} className="flex items-center gap-1" role="listitem">
            <span
              className={cx(
                "inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold flex-shrink-0",
                done && "bg-ok text-bg",
                active && "bg-accent text-bg animate-pulse",
                future && "bg-fg-subtle/20 text-fg-subtle",
              )}
            >
              {done ? "✓" : idx + 1}
            </span>
            <span
              className={cx(
                "text-[10px]",
                done && "text-ok",
                active && "text-accent font-medium",
                future && "text-fg-subtle",
              )}
            >
              {step.label}
            </span>
            {idx < STEPS.length - 1 && (
              <span className={cx("text-[10px] mx-0.5", done ? "text-ok" : "text-fg-subtle/40")}>
                →
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
