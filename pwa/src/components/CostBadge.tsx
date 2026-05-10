import { useEffect, type ReactElement } from "react";
import type { WorkflowEvent } from "../domain/types";
import { useCostStore } from "../store/useCostStore";
import { cx } from "../util/cx";

interface ProviderUsageEvent {
  kind: "usage";
  costUsd?: number;
}

interface CostBadgeProps {
  workflowId: string;
  subscribeProviderEvents: (listener: (evt: WorkflowEvent) => void) => () => void;
}

function rateTier(ratePerMin: number): "green" | "yellow" | "orange" | "red" {
  if (ratePerMin < 0.10) return "green";
  if (ratePerMin < 0.30) return "yellow";
  if (ratePerMin < 1.00) return "orange";
  return "red";
}

const tierClass: Record<string, string> = {
  green: "bg-ok/15 text-ok",
  yellow: "bg-warn/15 text-warn",
  orange: "bg-orange-400/15 text-orange-400",
  red: "bg-err/15 text-err",
};

export function CostBadge({ workflowId, subscribeProviderEvents }: CostBadgeProps): ReactElement | null {
  const addSample = useCostStore((s) => s.addSample);
  const rollingRate = useCostStore((s) => s.rollingRate);
  const storeWorkflowId = useCostStore((s) => s.workflowId);

  useEffect(() => {
    return subscribeProviderEvents((evt) => {
      if (evt.kind !== "provider-event") return;
      const pe = evt.payload.providerEvent as ProviderUsageEvent;
      if (pe.kind !== "usage" || typeof pe.costUsd !== "number") return;
      addSample(workflowId, pe.costUsd);
    });
  }, [workflowId, subscribeProviderEvents, addSample]);

  if (storeWorkflowId !== workflowId) return null;

  const rate = rollingRate();
  if (rate === 0) return null;

  const tier = rateTier(rate);

  return (
    <span
      className={cx("rounded px-1.5 py-0.5 text-[10px] font-mono tabular-nums", tierClass[tier])}
      title={`~$${rate.toFixed(3)}/min (60s rolling)`}
    >
      ${rate.toFixed(3)}/min
    </span>
  );
}
