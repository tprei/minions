import { useRef, useEffect } from "react";
import type { TaskExecutionStatus } from "../domain/types";
import type { ProviderEvent } from "../domain/providerEvent";
import { postCommand } from "../transport/rest";
import { useDraftState } from "../hooks/useDraftState";

type ComposerMode = "idle" | "running" | "feedback" | "approval" | "disabled";

function deriveMode(
  status: TaskExecutionStatus,
  pendingApproval: ProviderEvent | null,
): ComposerMode {
  if (
    pendingApproval !== null &&
    pendingApproval.kind === "permission_request" &&
    (status === "running" || status === "quality-pending" || status === "ci-pending")
  ) {
    return "approval";
  }
  switch (status) {
    case "pending":
    case "ready":
      return "idle";
    case "running":
    case "quality-pending":
    case "ci-pending":
      return "running";
    case "finalizing":
    case "pr-open":
    case "merged":
    case "cancelled":
      return "disabled";
    case "failed":
    case "needs-review":
      return "feedback";
    case "completed":
      return "disabled";
  }
}

interface Props {
  workflowId: string;
  taskId: string;
  executionStatus: TaskExecutionStatus;
  pendingApproval: ProviderEvent | null;
  queuedMessage: string | null;
  onQueue: (msg: string) => void;
}

export function Composer({
  workflowId,
  taskId,
  executionStatus,
  pendingApproval,
  queuedMessage,
  onQueue,
}: Props): JSX.Element | null {
  const mode = deriveMode(executionStatus, pendingApproval);
  const [draft, setDraft, clearDraft] = useDraftState(workflowId, taskId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerFocusedRef = useRef(false);

  useEffect(() => {
    if (mode !== "approval") return;

    function handleKey(e: KeyboardEvent): void {
      if (composerFocusedRef.current) return;
      if (pendingApproval?.kind !== "permission_request") return;
      const { id: requestId, tool, input } = pendingApproval;

      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        void postCommand({ kind: "approve-permission", workflowId, taskId, requestId, decision: "approve" });
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        void postCommand({ kind: "approve-permission", workflowId, taskId, requestId, decision: "deny", reason: "Denied via hotkey" });
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [mode, pendingApproval, workflowId, taskId]);

  if (mode === "disabled") return null;

  async function send(): Promise<void> {
    const text = draft.trim();
    if (!text) return;
    if (executionStatus === "failed") {
      await postCommand({ kind: "retry-task", workflowId, taskId, prompt: text });
    } else {
      await postCommand({ kind: "continue-task", workflowId, taskId, prompt: text });
    }
    clearDraft();
  }

  if (mode === "approval" && pendingApproval?.kind === "permission_request") {
    const { id: requestId } = pendingApproval;
    return (
      <div className="border-t border-border bg-bg-soft px-3 py-2 flex items-center gap-2">
        <span className="text-xs text-warn flex-1">Permission requested — press A to approve, D to deny</span>
        <button
          type="button"
          className="btn-primary text-xs px-3 py-1"
          onClick={() => void postCommand({ kind: "approve-permission", workflowId, taskId, requestId, decision: "approve" })}
        >
          Approve (A)
        </button>
        <button
          type="button"
          className="btn-secondary text-xs px-3 py-1"
          onClick={() => void postCommand({ kind: "approve-permission", workflowId, taskId, requestId, decision: "deny", reason: "Denied" })}
        >
          Deny (D)
        </button>
      </div>
    );
  }

  if (mode === "running") {
    const hasQueue = queuedMessage !== null;
    return (
      <div className="border-t border-border bg-bg-soft px-3 py-2 flex items-center gap-2">
        <span className="text-xs text-fg-muted flex-1">
          {hasQueue ? `Queued: "${queuedMessage}"` : "Agent is running…"}
        </span>
        {!hasQueue && (
          <button
            type="button"
            className="btn-secondary text-xs px-3 py-1 flex items-center gap-1"
            onClick={() => {
              const text = draft.trim();
              if (text) { onQueue(text); clearDraft(); }
            }}
          >
            🕐 Queue
          </button>
        )}
      </div>
    );
  }

  const placeholder =
    mode === "feedback"
      ? "Send a follow-up or retry with new instructions…"
      : "Send a message…";

  return (
    <div
      className="border-t border-border bg-bg-soft"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-end gap-2 px-3 py-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => { composerFocusedRef.current = true; }}
          onBlur={() => { composerFocusedRef.current = false; }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
          placeholder={placeholder}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none min-h-[2rem] max-h-40 leading-6"
          style={{ height: "auto", overflowY: draft.includes("\n") ? "auto" : "hidden" }}
        />
        <button
          type="button"
          disabled={!draft.trim()}
          onClick={() => void send()}
          className="btn-primary shrink-0 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {mode === "feedback" ? "Retry" : "Send"}
        </button>
      </div>
    </div>
  );
}
