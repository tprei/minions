import { useRef, useEffect } from "react";
import type { TaskExecutionStatus } from "../domain/types";
import type { ProviderEvent } from "../domain/providerEvent";
import { postCommand } from "../transport/rest";
import { useDraftState } from "../hooks/useDraftState";
import { Banner } from "./Banner";

type ComposerAvailability =
  | { available: true; mode: "idle" | "running" | "feedback" | "approval" }
  | { available: false; reason: string };

function deriveAvailability(
  status: TaskExecutionStatus,
  pendingApproval: ProviderEvent | null,
): ComposerAvailability {
  if (
    pendingApproval !== null &&
    pendingApproval.kind === "permission_request" &&
    (status === "running" || status === "quality-pending" || status === "ci-pending")
  ) {
    return { available: true, mode: "approval" };
  }
  switch (status) {
    case "pending":
    case "ready":
      return { available: false, reason: "Task waiting for the runner to pick it up." };
    case "running":
    case "quality-pending":
    case "ci-pending":
      return { available: true, mode: "running" };
    case "finalizing":
    case "pr-open":
      return { available: false, reason: "Task is finalizing. Reply will be available after merge or if it returns to needs-review." };
    case "merged":
    case "completed":
      return { available: false, reason: "Task is complete. Reply isn't supported in this state yet." };
    case "failed":
    case "needs-review":
      return { available: true, mode: "feedback" };
    case "cancelled":
      return { available: false, reason: "Task was cancelled." };
  }
}

function isTextInputFocused(): boolean {
  const ae = document.activeElement;
  if (ae instanceof HTMLTextAreaElement) return true;
  if (ae instanceof HTMLInputElement) return true;
  if (ae instanceof HTMLElement && ae.isContentEditable) return true;
  return false;
}

interface Props {
  workflowId: string;
  taskId: string;
  executionStatus: TaskExecutionStatus;
  pendingApproval: ProviderEvent | null;
  queuedMessage: string | null;
  onQueue: (msg: string) => void;
  onApprovalResolved?: () => void;
}

export function Composer({
  workflowId,
  taskId,
  executionStatus,
  pendingApproval,
  queuedMessage,
  onQueue,
  onApprovalResolved,
}: Props): JSX.Element {
  const availability = deriveAvailability(executionStatus, pendingApproval);
  const [draft, setDraft, clearDraft] = useDraftState(workflowId, taskId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!availability.available || availability.mode !== "approval") return;

    function handleKey(e: KeyboardEvent): void {
      if (isTextInputFocused()) return;
      if (pendingApproval?.kind !== "permission_request") return;
      const requestId = pendingApproval.id;

      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        postCommand({ kind: "approve-permission", workflowId, taskId, requestId, decision: "approve" })
          .then(() => onApprovalResolved?.())
          .catch(() => undefined);
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        postCommand({ kind: "approve-permission", workflowId, taskId, requestId, decision: "deny", reason: "Denied via hotkey" })
          .then(() => onApprovalResolved?.())
          .catch(() => undefined);
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [availability, pendingApproval, workflowId, taskId, onApprovalResolved]);

  if (!availability.available) {
    return (
      <div
        className="border-t border-border bg-bg-soft"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <Banner tone="info" message={availability.reason} className="mx-3 mt-2 mb-1" />
        <div className="flex items-end gap-2 px-3 py-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Reply unavailable…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none min-h-[2rem] max-h-40 leading-6"
            style={{ height: "auto", overflowY: draft.includes("\n") ? "auto" : "hidden" }}
          />
          <button
            type="button"
            disabled
            className="btn-primary shrink-0 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    );
  }

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

  if (availability.mode === "approval" && pendingApproval?.kind === "permission_request") {
    const requestId = pendingApproval.id;
    return (
      <div className="border-t border-border bg-bg-soft px-3 py-2 flex items-center gap-2">
        <span className="text-xs text-warn flex-1">Permission requested — press A to approve, D to deny</span>
        <button
          type="button"
          className="btn-primary text-xs px-3 py-1"
          onClick={() => {
            postCommand({ kind: "approve-permission", workflowId, taskId, requestId, decision: "approve" })
              .then(() => onApprovalResolved?.())
              .catch(() => undefined);
          }}
        >
          Approve (A)
        </button>
        <button
          type="button"
          className="btn-secondary text-xs px-3 py-1"
          onClick={() => {
            postCommand({ kind: "approve-permission", workflowId, taskId, requestId, decision: "deny", reason: "Denied" })
              .then(() => onApprovalResolved?.())
              .catch(() => undefined);
          }}
        >
          Deny (D)
        </button>
      </div>
    );
  }

  if (availability.mode === "running") {
    const hasQueue = queuedMessage !== null;
    return (
      <div className="border-t border-border bg-bg-soft px-3 py-2 flex items-center gap-2">
        {hasQueue ? (
          <span className="text-xs text-fg-muted flex-1">{`Queued: "${queuedMessage}"`}</span>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Queue a follow-up…"
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none min-h-[1.5rem] max-h-20 leading-6"
              style={{ height: "auto" }}
            />
            <button
              type="button"
              className="btn-secondary text-xs px-3 py-1 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!draft.trim()}
              onClick={() => {
                const text = draft.trim();
                if (text) { onQueue(text); clearDraft(); }
              }}
            >
              🕐 Queue
            </button>
          </>
        )}
      </div>
    );
  }

  const placeholder =
    availability.mode === "feedback"
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
          {availability.mode === "feedback" ? "Retry" : "Send"}
        </button>
      </div>
    </div>
  );
}
