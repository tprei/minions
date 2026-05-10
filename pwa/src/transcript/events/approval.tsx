import { useState } from "react";
import { postCommand } from "../../transport/rest";

interface Props {
  id: string;
  tool: string;
  input: unknown;
  workflowId: string;
  taskId: string;
  onResolved?: (requestId: string) => void;
}

type State = "idle" | "denying" | "resolved-approve" | "resolved-deny";

export function Approval({ id, tool, input, workflowId, taskId, onResolved }: Props): JSX.Element {
  const [uiState, setUiState] = useState<State>("idle");
  const [denyReason, setDenyReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const inputStr = JSON.stringify(input);
  const preview = inputStr.length > 120 ? inputStr.slice(0, 120) + "…" : inputStr;

  async function approve(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await postCommand({ kind: "approve-permission", workflowId, taskId, requestId: id, decision: "approve" });
      setUiState("resolved-approve");
      onResolved?.(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitDeny(): Promise<void> {
    const reason = denyReason.trim();
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    try {
      await postCommand({ kind: "approve-permission", workflowId, taskId, requestId: id, decision: "deny", reason });
      setUiState("resolved-deny");
      onResolved?.(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="te te-approval rounded border border-warn/40 bg-warn/5 px-3 py-2 flex flex-col gap-2" data-request-id={id}>
      <div className="te-approval-header text-xs font-medium text-warn">
        Permission request: {tool}
      </div>
      <div className="te-approval-input-preview text-[11px] font-mono text-fg-muted">
        {preview}
      </div>
      {error && (
        <div className="te-approval-error text-xs text-err">{error}</div>
      )}
      {(uiState === "resolved-approve" || uiState === "resolved-deny") && (
        <div className="te-approval-success text-xs text-ok">
          {uiState === "resolved-approve" ? "Approved" : "Denied"}
        </div>
      )}
      {uiState === "idle" && (
        <div className="te-approval-actions flex gap-2">
          <button
            type="button"
            className="btn-primary text-xs px-3 py-1"
            disabled={submitting}
            onClick={() => void approve()}
          >
            Approve
          </button>
          <button
            type="button"
            className="btn-secondary text-xs px-3 py-1"
            disabled={submitting}
            onClick={() => setUiState("denying")}
          >
            Deny
          </button>
        </div>
      )}
      {uiState === "denying" && (
        <div className="te-approval-deny-form flex flex-col gap-2">
          <textarea
            className="te-approval-deny-textarea text-xs bg-bg-soft border border-border rounded px-2 py-1 text-fg placeholder:text-fg-subtle resize-none"
            rows={2}
            placeholder="Reason for denial (required)"
            value={denyReason}
            onChange={(e) => setDenyReason(e.target.value)}
          />
          <div className="te-approval-deny-form-actions flex gap-2">
            <button
              type="button"
              className="btn-primary text-xs px-3 py-1"
              disabled={submitting || !denyReason.trim()}
              onClick={() => void submitDeny()}
            >
              Submit Deny
            </button>
            <button
              type="button"
              className="btn-secondary text-xs px-3 py-1"
              disabled={submitting}
              onClick={() => { setUiState("idle"); setDenyReason(""); }}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
