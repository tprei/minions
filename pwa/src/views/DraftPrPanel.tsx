import { useState, type ReactElement } from "react";
import { draftPr } from "../transport/rest";
import { Spinner } from "../components/Spinner";
import { Banner } from "../components/Banner";

interface DraftPrPanelProps {
  workflowId: string;
  taskId: string;
}

export function DraftPrPanel({ workflowId, taskId }: DraftPrPanelProps): ReactElement {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDraft(): Promise<void> {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      await draftPr(workflowId, taskId, controller.signal);
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === "AbortError" || controller.signal.aborted)) {
        setError("Timed out — retry?");
      } else {
        setError(err instanceof Error ? err.message : "Failed to draft PR");
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 p-4">
      <div className="card p-4 flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium text-fg">Task is finalizing</p>
          <p className="text-xs text-fg-muted mt-0.5">No PR artifact yet. Draft one to continue.</p>
        </div>
        {error && (
          <Banner tone="error" message={error} onDismiss={() => setError(null)} />
        )}
        <button
          type="button"
          className="btn-primary text-sm self-start disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          disabled={loading}
          onClick={() => void handleDraft()}
        >
          {loading && <Spinner size="sm" />}
          {loading ? "Drafting PR…" : "Draft PR"}
        </button>
      </div>
    </div>
  );
}
