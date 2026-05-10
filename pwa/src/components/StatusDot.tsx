import type { ReactElement } from "react";
import type { TaskExecutionStatus } from "../domain/types";
import { cx } from "../util/cx";

interface StatusDotProps {
  status: TaskExecutionStatus;
  size?: "sm" | "md";
  className?: string;
}

const statusColor: Record<TaskExecutionStatus, string> = {
  pending: "bg-fg-subtle",
  ready: "bg-accent",
  running: "bg-ok animate-pulse",
  finalizing: "bg-ok animate-pulse",
  "quality-pending": "bg-warn animate-pulse",
  "ci-pending": "bg-warn animate-pulse",
  "pr-open": "bg-accent",
  merged: "bg-ok",
  completed: "bg-ok",
  "needs-review": "bg-warn",
  failed: "bg-err",
  cancelled: "bg-fg-subtle",
};

const sizeClass = {
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
};

export function StatusDot({ status, size = "md", className }: StatusDotProps): ReactElement {
  return (
    <span
      aria-label={status}
      className={cx(
        "inline-block rounded-full flex-shrink-0",
        statusColor[status],
        sizeClass[size],
        className,
      )}
    />
  );
}
