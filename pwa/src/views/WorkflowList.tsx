import { useEffect, useRef, useState } from "react";
import { listWorkflows } from "../transport/rest";
import { RestError } from "../transport/rest";
import { useWorkflowStore, useWorkflows } from "../store/useWorkflowStore";
import { navigate } from "../routing/router";

const POLL_INTERVAL_MS = 2000;

export function WorkflowList(): JSX.Element {
  const setSummaries = useWorkflowStore((s) => s.setSummaries);
  const summaries = useWorkflows();
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function fetch(): Promise<void> {
      try {
        const list = await listWorkflows();
        if (!mountedRef.current) return;
        setError(null);
        setSummaries(list);
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        setError(err instanceof RestError ? `HTTP ${err.status}` : "Failed to load workflows");
      }
    }

    void fetch();
    const timer = setInterval(() => { void fetch(); }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [setSummaries]);

  if (summaries === undefined && error === null) {
    return <p className="text-sm opacity-60">Loading workflows…</p>;
  }

  if (error !== null) {
    return <p className="text-sm text-red-500">{error}</p>;
  }

  if (summaries === undefined || summaries.length === 0) {
    return <p className="text-sm opacity-60">No active workflows.</p>;
  }

  return (
    <ul className="space-y-2">
      {summaries.map((w) => (
        <li key={w.id}>
          <button
            type="button"
            className="w-full flex gap-3 p-3 border border-border rounded text-sm font-mono hover:bg-bg-elev transition-colors text-left"
            onClick={() => navigate(`#/workflow/${w.id}`)}
          >
            <span className="opacity-60 truncate flex-1">{w.id}</span>
            <span>{w.status}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
