import { useState } from "react";
import { createWorkflow } from "../transport/rest";
import { navigate } from "../routing/router";
import { Modal } from "../components/Modal";

export function CompactNewWorkflowModal(): JSX.Element {
  const [open, setOpen] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    const text = prompt.trim();
    if (!text) return;
    setSubmitting(true);
    setError(null);
    try {
      const workflowId = crypto.randomUUID();
      const taskId = "t1";
      await createWorkflow({
        id: workflowId,
        kind: "single-task",
        tasks: [{ id: taskId, title: text.slice(0, 80), prompt: text }],
      });
      navigate(`#/workflow/${workflowId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workflow");
      setSubmitting(false);
    }
  }

  function handleClose(): void {
    setOpen(false);
    navigate("#/");
  }

  return (
    <Modal open={open} onClose={handleClose} title="New workflow">
      <div className="flex flex-col gap-3">
        <textarea
          className="w-full bg-bg-soft border border-border rounded px-3 py-2 text-sm text-fg placeholder:text-fg-subtle resize-none focus:outline-none focus:ring-1 focus:ring-accent"
          rows={4}
          placeholder="Describe what the agent should do…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          autoFocus
        />
        {error && (
          <p className="text-xs text-err">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary text-xs" onClick={handleClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={submitting || !prompt.trim()}
            onClick={() => void handleSubmit()}
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
