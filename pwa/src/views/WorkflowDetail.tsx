import { useEffect, useState, useCallback } from "react";
import type { TaskNode, Workflow, WorkflowEvent } from "../domain/types";
import type { ProviderEvent } from "../domain/providerEvent";
import { getWorkflow } from "../transport/rest";
import { subscribeWorkflow } from "../transport/sse";
import { useWorkflowStore, useWorkflowById } from "../store/useWorkflowStore";
import { useConnectionStore } from "../store/useConnectionStore";
import { Spinner } from "../components/Spinner";
import { Pill } from "../components/Pill";
import { Banner } from "../components/Banner";
import { TranscriptView } from "./TranscriptView";
import { Composer } from "../components/Composer";
import { DagSheet } from "./DagSheet";

const STATUS_ORDER: Record<string, number> = {
  running: 0,
  "quality-pending": 1,
  "ci-pending": 2,
  finalizing: 3,
  "pr-open": 4,
  "needs-review": 5,
  ready: 6,
  pending: 7,
  completed: 8,
  merged: 9,
  failed: 10,
  cancelled: 11,
};

const TERMINAL_STATUSES = new Set(["merged", "cancelled", "failed", "completed"]);

function pickActiveTask(workflow: Workflow): TaskNode | undefined {
  const tasks = Object.values(workflow.graph);
  if (tasks.length === 0) return undefined;

  // Prefer non-terminal tasks, sorted by how "active" they are
  const nonTerminal = tasks.filter((t) => !TERMINAL_STATUSES.has(t.executionStatus));
  if (nonTerminal.length > 0) {
    return nonTerminal.sort(
      (a, b) =>
        (STATUS_ORDER[a.executionStatus] ?? 99) - (STATUS_ORDER[b.executionStatus] ?? 99),
    )[0];
  }

  // Fall back to the last task by creation time
  return tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function workflowStatusTone(status: Workflow["status"]): "ok" | "err" | "warn" | "neutral" {
  switch (status) {
    case "active": return "ok";
    case "completed": return "ok";
    case "failed": return "err";
    case "cancelled": return "neutral";
  }
}

interface Props {
  id: string;
}

export function WorkflowDetail({ id }: Props): JSX.Element {
  const setWorkflow = useWorkflowStore((s) => s.setWorkflow);
  const applyEvent = useWorkflowStore((s) => s.applyEvent);
  const setConnectionState = useConnectionStore((s) => s.setState);
  const setCurrentWorkflowId = useConnectionStore((s) => s.setCurrentWorkflowId);

  const workflow = useWorkflowById(id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dagOpen, setDagOpen] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<string | undefined>(undefined);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ProviderEvent | null>(null);

  useEffect(() => {
    setCurrentWorkflowId(id);
    let cancelled = false;

    getWorkflow(id)
      .then((wf) => {
        if (!cancelled) setWorkflow(wf);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load workflow");
      });

    const sub = subscribeWorkflow(id, {
      onEvent(evt: WorkflowEvent) {
        applyEvent(evt);
        if (evt.kind === "provider-event") {
          const pe = evt.payload.providerEvent as ProviderEvent;
          if (pe.kind === "permission_request") {
            setPendingApproval(pe);
          } else if (pe.kind === "final") {
            setPendingApproval(null);
          }
        }
        if (evt.kind === "task-transitioned") {
          const { toExecutionStatus } = evt.payload;
          if (!["running", "quality-pending", "ci-pending"].includes(toExecutionStatus)) {
            setPendingApproval(null);
          }
          if (queuedMessage && ["pending", "ready"].includes(toExecutionStatus)) {
            setQueuedMessage(null);
          }
        }
      },
      onStateChange(state) {
        setConnectionState(state);
      },
    });

    return () => {
      cancelled = true;
      sub.close();
      setConnectionState("idle");
    };
  // queuedMessage intentionally excluded — we only want this to re-run on id change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, setWorkflow, applyEvent, setConnectionState, setCurrentWorkflowId]);

  const handleQueue = useCallback((msg: string) => {
    setQueuedMessage(msg);
  }, []);

  const connectionState = useConnectionStore((s) => s.state);

  if (!workflow && loadError) {
    return (
      <div className="p-4 text-sm text-err">{loadError}</div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const activeTask = focusedTaskId
    ? workflow.graph[focusedTaskId] ?? pickActiveTask(workflow)
    : pickActiveTask(workflow);

  const status = activeTask?.executionStatus ?? "pending";

  function renderPhase(): JSX.Element {
    if (!activeTask) {
      return <p className="text-sm text-fg-muted p-4">No tasks in workflow.</p>;
    }

    switch (status) {
      case "pending":
      case "ready":
        return (
          <div className="flex flex-col h-full">
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-sm text-fg-muted text-center">
                Task is queued — send a prompt to start.
              </p>
            </div>
            <Composer
              workflowId={id}
              taskId={activeTask.id}
              executionStatus={status}
              pendingApproval={pendingApproval}
              queuedMessage={queuedMessage}
              onQueue={handleQueue}
            />
          </div>
        );

      case "running":
      case "quality-pending":
      case "ci-pending":
        return (
          <div className="flex flex-col h-full">
            <TranscriptView workflowId={id} taskId={activeTask.id} />
            <Composer
              workflowId={id}
              taskId={activeTask.id}
              executionStatus={status}
              pendingApproval={pendingApproval}
              queuedMessage={queuedMessage}
              onQueue={handleQueue}
            />
          </div>
        );

      case "finalizing":
      case "pr-open":
        return (
          <div className="flex flex-col h-full">
            <div className="flex-1 p-4">
              <div className="card p-4 text-sm text-fg-muted">
                PR card coming in S4
              </div>
            </div>
          </div>
        );

      case "merged":
      case "completed":
        return (
          <div className="p-4">
            <div className="card p-4">
              <p className="text-sm font-medium text-fg">Task {status}</p>
              {activeTask.artifacts.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {activeTask.artifacts.map((a, i) => (
                    <li key={i} className="text-xs text-fg-muted font-mono">
                      {a.kind}: {a.ref}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );

      case "failed":
      case "cancelled":
        return (
          <div className="flex flex-col h-full">
            <div className="flex-1 p-4">
              <div className="card border-err/40 bg-err/5 p-4">
                <p className="text-sm font-medium text-err">Task {status}</p>
              </div>
            </div>
            {status === "failed" && (
              <Composer
                workflowId={id}
                taskId={activeTask.id}
                executionStatus={status}
                pendingApproval={null}
                queuedMessage={null}
                onQueue={handleQueue}
              />
            )}
          </div>
        );

      case "needs-review":
        return (
          <div className="p-4">
            <div className="card p-4">
              <p className="text-sm font-medium text-warn">Operator review required</p>
              <a
                href={`#/audit?workflowId=${encodeURIComponent(id)}`}
                className="text-xs text-accent mt-1 block"
              >
                View audit log →
              </a>
            </div>
          </div>
        );
    }
  }

  const workflowTitle = activeTask?.title ?? id.slice(0, 8);

  return (
    <div className="flex flex-col h-full">
      {(connectionState === "reconnecting" || connectionState === "error") && (
        <Banner
          tone="warning"
          message={connectionState === "reconnecting" ? "Reconnecting…" : "Connection error — events may be delayed"}
          className="mx-4 mt-2"
        />
      )}

      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <h1 className="text-sm font-medium text-fg truncate flex-1">{workflowTitle}</h1>
        <Pill tone={workflowStatusTone(workflow.status)} className="text-[10px]">
          {workflow.status}
        </Pill>
        <button
          type="button"
          className="text-xs text-fg-muted hover:text-fg transition-colors px-2 py-1 rounded hover:bg-bg-elev"
          onClick={() => setDagOpen(true)}
        >
          Tasks ({Object.keys(workflow.graph).length})
        </button>
      </div>

      <div className="flex-1 min-h-0">
        {renderPhase()}
      </div>

      <DagSheet
        open={dagOpen}
        onClose={() => setDagOpen(false)}
        workflow={workflow}
        activeTaskId={activeTask?.id}
        onFocusTask={(taskId) => setFocusedTaskId(taskId)}
      />
    </div>
  );
}
