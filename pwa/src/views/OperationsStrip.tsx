import { useState, type ReactElement } from "react";
import type { GraphOperation, Workflow } from "../domain/types";
import { postCommand } from "../transport/rest";
import { Markdown } from "../components/Markdown";
import { Banner } from "../components/Banner";

interface OperationsStripProps {
  workflow: Workflow;
}

const IN_FLIGHT_STATUSES = new Set(["pending", "running"]);

interface ResolveState {
  loading: boolean;
  error: string | null;
}

function OperationCard({ op, workflowId }: { op: GraphOperation; workflowId: string }): ReactElement {
  const [state, setState] = useState<ResolveState>({ loading: false, error: null });

  async function handleResolve(): Promise<void> {
    setState({ loading: true, error: null });
    try {
      await postCommand({
        kind: "complete-restack",
        workflowId,
        input: {
          operationId: op.id,
          now: new Date().toISOString(),
        },
      });
      setState({ loading: false, error: null });
    } catch (err: unknown) {
      setState({ loading: false, error: err instanceof Error ? err.message : "Resolve failed" });
    }
  }

  return (
    <div className="card border-warn/30 bg-warn/5 p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-fg">
            {op.kind === "restack" ? "Restack pending" : op.kind}
          </span>
          {op.affectedNodeIds.length > 0 && (
            <span className="text-[10px] text-fg-subtle">
              Tasks: {op.affectedNodeIds.join(", ")}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn-secondary text-xs shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={state.loading}
          onClick={() => void handleResolve()}
        >
          {state.loading ? "Resolving…" : "Resolve"}
        </button>
      </div>
      {op.error && (
        <Markdown source={op.error} className="text-xs text-warn" />
      )}
      {state.error && (
        <Banner tone="error" message={state.error} />
      )}
    </div>
  );
}

export function OperationsStrip({ workflow }: OperationsStripProps): ReactElement | null {
  const ops = Object.values(workflow.operations).filter((op) =>
    IN_FLIGHT_STATUSES.has(op.status),
  );

  if (ops.length === 0) return null;

  return (
    <div className="px-4 py-2 flex flex-col gap-2">
      {ops.map((op) => (
        <OperationCard key={op.id} op={op} workflowId={workflow.id} />
      ))}
    </div>
  );
}
