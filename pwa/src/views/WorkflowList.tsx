import { useEffect, useState } from "react";
import { listWorkflows, RestError } from "../transport/rest";
import type { WorkflowSummary } from "../transport/rest";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ok"; workflows: WorkflowSummary[] };

export function WorkflowList(): JSX.Element {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    listWorkflows()
      .then((workflows) => {
        if (!cancelled) setState({ phase: "ok", workflows });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof RestError ? `HTTP ${err.status}` : "Failed to load workflows";
        setState({ phase: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === "loading") {
    return <p className="text-sm opacity-60">Loading workflows…</p>;
  }

  if (state.phase === "error") {
    return <p className="text-sm text-red-500">{state.message}</p>;
  }

  if (state.workflows.length === 0) {
    return <p className="text-sm opacity-60">No active workflows.</p>;
  }

  return (
    <ul className="space-y-2">
      {state.workflows.map((w) => (
        <li key={w.id} className="flex gap-3 p-3 border rounded text-sm font-mono">
          <span className="opacity-60 truncate">{w.id}</span>
          <span>{w.status}</span>
        </li>
      ))}
    </ul>
  );
}
