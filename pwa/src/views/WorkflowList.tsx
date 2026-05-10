import { useEffect, useRef } from "react";
import { listWorkflows } from "../transport/rest";
import { RestError } from "../transport/rest";
import { useWorkflowStore, useWorkflows } from "../store/useWorkflowStore";

// FUTURE: replace polling with a global SSE channel once the engine provides one
const POLL_INTERVAL_MS = 2000;

export function WorkflowList(): JSX.Element {
  const setSummaries = useWorkflowStore((s) => s.setSummaries);
  const summaries = useWorkflows();
  const errorRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    errorRef.current = null;

    async function fetch(): Promise<void> {
      try {
        const list = await listWorkflows();
        if (mountedRef.current) setSummaries(list);
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        errorRef.current =
          err instanceof RestError ? `HTTP ${err.status}` : "Failed to load workflows";
        setSummaries([]);
      }
    }

    void fetch();
    const timer = setInterval(() => { void fetch(); }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [setSummaries]);

  if (summaries === undefined) {
    return <p className="text-sm opacity-60">Loading workflows…</p>;
  }

  if (errorRef.current !== null) {
    return <p className="text-sm text-red-500">{errorRef.current}</p>;
  }

  if (summaries.length === 0) {
    return <p className="text-sm opacity-60">No active workflows.</p>;
  }

  return (
    <ul className="space-y-2">
      {summaries.map((w) => (
        <li key={w.id} className="flex gap-3 p-3 border rounded text-sm font-mono">
          <span className="opacity-60 truncate">{w.id}</span>
          <span>{w.status}</span>
        </li>
      ))}
    </ul>
  );
}
