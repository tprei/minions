import { useEffect, useRef, useState } from "react";
import type { MergePhase, MergePhasePayload, WorkflowEvent } from "../domain/types";
import { Spinner } from "../components/Spinner";

const PHASES: MergePhase[] = [
  "prepareMerge",
  "commit",
  "squash",
  "rebase",
  "applyMerge",
  "finalize",
];

const PHASE_LABELS: Record<MergePhase, string> = {
  prepareMerge: "Prepare merge",
  commit: "Commit",
  squash: "Squash",
  rebase: "Rebase",
  applyMerge: "Apply merge",
  finalize: "Finalize",
};

type PhaseStatus = "pending" | "started" | "completed" | "error";

interface PhaseState {
  status: PhaseStatus;
  error?: string;
}

interface Props {
  taskId: string;
  subscribeProviderEvents: (listener: (evt: WorkflowEvent) => void) => () => void;
  prUrl?: string;
}

export function MergeProgress({ taskId, subscribeProviderEvents, prUrl }: Props): JSX.Element {
  const [phaseMap, setPhaseMap] = useState<Record<MergePhase, PhaseState>>(() => {
    const init = {} as Record<MergePhase, PhaseState>;
    for (const p of PHASES) init[p] = { status: "pending" };
    return init;
  });
  const [done, setDone] = useState(false);
  const finalizedRef = useRef(false);

  useEffect(() => {
    return subscribeProviderEvents((evt) => {
      if (evt.kind !== "merge-phase") return;
      const payload = evt.payload as MergePhasePayload;
      if (payload.taskId !== taskId) return;

      setPhaseMap((prev) => {
        const next = { ...prev };
        if (payload.status === "started") {
          next[payload.phase] = { status: "started" };
        } else if (payload.status === "completed") {
          if (payload.error) {
            next[payload.phase] = { status: "error", error: payload.error };
          } else {
            next[payload.phase] = { status: "completed" };
          }
          if (payload.phase === "finalize" && !payload.error && !finalizedRef.current) {
            finalizedRef.current = true;
            setDone(true);
          }
        }
        return next;
      });
    });
  }, [taskId, subscribeProviderEvents]);

  if (done) {
    return (
      <div className="card p-4">
        <div className="text-sm font-medium text-ok mb-2">Merge complete</div>
        {prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline"
          >
            View merged PR →
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-fg-muted mb-3">Merging…</div>
      <div className="space-y-2">
        {PHASES.map((phase) => {
          const state = phaseMap[phase];
          return (
            <div key={phase} className="flex items-center gap-2">
              <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                {state.status === "pending" && (
                  <span className="w-2 h-2 rounded-full bg-fg-subtle" />
                )}
                {state.status === "started" && <Spinner size="sm" />}
                {state.status === "completed" && (
                  <span className="text-ok text-[13px]">✓</span>
                )}
                {state.status === "error" && (
                  <span className="text-err text-[13px]">✗</span>
                )}
              </div>
              <span
                className={`text-xs ${
                  state.status === "started"
                    ? "text-fg font-medium"
                    : state.status === "completed"
                      ? "text-fg-muted line-through"
                      : state.status === "error"
                        ? "text-err"
                        : "text-fg-subtle"
                }`}
              >
                {PHASE_LABELS[phase]}
              </span>
              {state.status === "error" && state.error && (
                <span className="text-[11px] text-err ml-1">{state.error}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
