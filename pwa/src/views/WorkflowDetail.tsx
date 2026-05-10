import { useEffect, useState, useCallback, useRef } from "react";
import type { Workflow, WorkflowEvent } from "../domain/types";
import type { ProviderEvent } from "../domain/providerEvent";
import { pickActiveTask } from "../utils/pickActiveTask";
import { agentTone } from "../utils/agentColor";
import { StatusDot } from "../components/StatusDot";
import {
  getWorkflow,
  postCommand,
  subscribePush,
  unsubscribePush,
  getVapidPublicKey,
  type PushSubscriptionBody,
} from "../transport/rest";
import { getPushSubscription } from "../pwa/push";
import { subscribeWorkflow } from "../transport/sse";
import { useWorkflowStore, useWorkflowById } from "../store/useWorkflowStore";
import { useConnectionStore } from "../store/useConnectionStore";
import { Spinner } from "../components/Spinner";
import { Pill } from "../components/Pill";
import { Banner } from "../components/Banner";
import { TranscriptView } from "./TranscriptView";
import { Composer } from "../components/Composer";
import { DagSheet } from "./DagSheet";
import { PrTab } from "./PrTab";
import { ArtifactList } from "../artifacts/ArtifactList";
import { urlBase64ToUint8Array } from "../pwa/push";
import { OperationsStrip } from "./OperationsStrip";
import { DraftPrPanel } from "./DraftPrPanel";
import { CompletionStepper } from "../components/CompletionStepper";
import { CostBadge } from "../components/CostBadge";

const QUEUE_FLUSH_TARGET_STATUSES = new Set(["pending", "ready", "completed", "failed"]);

function workflowStatusTone(status: Workflow["status"]): "ok" | "err" | "warn" | "neutral" {
  switch (status) {
    case "active": return "ok";
    case "completed": return "ok";
    case "failed": return "err";
    case "cancelled": return "neutral";
  }
}

const PUSH_STORAGE_KEY = (id: string): string => `pushSubscribed:${id}`;

interface Props {
  id: string;
}

interface QueuedSend {
  taskId: string;
  message: string;
}

export function WorkflowDetail({ id }: Props): JSX.Element {
  const setWorkflow = useWorkflowStore((s) => s.setWorkflow);
  const applyEvent = useWorkflowStore((s) => s.applyEvent);
  const setConnectionState = useConnectionStore((s) => s.setState);
  const setCurrentWorkflowId = useConnectionStore((s) => s.setCurrentWorkflowId);

  const workflow = useWorkflowById(id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [dagOpen, setDagOpen] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<string | undefined>(undefined);
  const [queuedSend, setQueuedSend] = useState<QueuedSend | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ProviderEvent | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState(
    () => localStorage.getItem(PUSH_STORAGE_KEY(id)) === "1",
  );
  const [pushError, setPushError] = useState<string | null>(null);

  const queuedSendRef = useRef<QueuedSend | null>(null);
  queuedSendRef.current = queuedSend;

  const providerEventListenersRef = useRef<Set<(evt: WorkflowEvent) => void>>(new Set());

  const subscribeProviderEvents = useCallback(
    (listener: (evt: WorkflowEvent) => void): (() => void) => {
      providerEventListenersRef.current.add(listener);
      return () => {
        providerEventListenersRef.current.delete(listener);
      };
    },
    [],
  );

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
          for (const listener of providerEventListenersRef.current) listener(evt);
        }

        if (evt.kind === "merge-phase") {
          for (const listener of providerEventListenersRef.current) listener(evt);
        }

        if (evt.kind === "task-transitioned") {
          const { toExecutionStatus, taskId: transTaskId } = evt.payload;

          if (!["running", "quality-pending", "ci-pending"].includes(toExecutionStatus)) {
            setPendingApproval(null);
          }

          const queued = queuedSendRef.current;
          if (
            queued !== null &&
            queued.taskId === transTaskId &&
            QUEUE_FLUSH_TARGET_STATUSES.has(toExecutionStatus)
          ) {
            queuedSendRef.current = null;
            setQueuedSend(null);
            const cmd = toExecutionStatus === "failed"
              ? { kind: "retry-task" as const, workflowId: id, taskId: transTaskId, prompt: queued.message }
              : { kind: "continue-task" as const, workflowId: id, taskId: transTaskId, prompt: queued.message };
            postCommand(cmd).catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : "Failed to send queued message";
              setQueueError(msg);
              queuedSendRef.current = queued;
              setQueuedSend(queued);
            });
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
  }, [id, setWorkflow, applyEvent, setConnectionState, setCurrentWorkflowId]);

  const handleQueue = useCallback((taskId: string, msg: string) => {
    setQueueError(null);
    setQueuedSend({ taskId, message: msg });
  }, []);

  const handleApprovalResolved = useCallback(() => {
    setPendingApproval(null);
  }, []);

  async function handleTogglePush(): Promise<void> {
    setPushError(null);
    try {
      if (pushSubscribed) {
        const sub = await getPushSubscription();
        if (sub) {
          await unsubscribePush(sub.endpoint, id);
          await sub.unsubscribe();
        }
        localStorage.removeItem(PUSH_STORAGE_KEY(id));
        setPushSubscribed(false);
      } else {
        const { publicKey } = await getVapidPublicKey();
        const key = urlBase64ToUint8Array(publicKey);

        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key.buffer as ArrayBuffer,
        });
        const json = sub.toJSON();
        const keys = json.keys as { p256dh: string; auth: string } | undefined;
        if (!json.endpoint || !keys?.p256dh || !keys?.auth) {
          throw new Error("Incomplete push subscription");
        }
        const body: PushSubscriptionBody = {
          endpoint: json.endpoint,
          keys: { p256dh: keys.p256dh, auth: keys.auth },
        };
        await subscribePush(id, body);
        localStorage.setItem(PUSH_STORAGE_KEY(id), "1");
        setPushSubscribed(true);
      }
    } catch (err: unknown) {
      setPushError(err instanceof Error ? err.message : "Push toggle failed");
    }
  }

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
  const queuedMessageForActive =
    queuedSend !== null && activeTask && queuedSend.taskId === activeTask.id
      ? queuedSend.message
      : null;

  function renderPhase(): JSX.Element {
    if (!activeTask) {
      return <p className="text-sm text-fg-muted p-4">No tasks in workflow.</p>;
    }

    const artifactSection = activeTask.artifacts.length > 0 ? (
      <div className="px-4 pb-4">
        <ArtifactList artifacts={activeTask.artifacts} />
      </div>
    ) : null;

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
            {artifactSection}
            <Composer
              workflowId={id}
              taskId={activeTask.id}
              executionStatus={status}
              pendingApproval={pendingApproval}
              queuedMessage={queuedMessageForActive}
              onQueue={(msg) => handleQueue(activeTask.id, msg)}
              onApprovalResolved={handleApprovalResolved}
            />
          </div>
        );

      case "running":
      case "quality-pending":
      case "ci-pending": {
        const latestRun = activeTask.runs[activeTask.runs.length - 1];
        return (
          <div className="flex flex-col h-full">
            <TranscriptView
              workflowId={id}
              taskId={activeTask.id}
              subscribeProviderEvents={subscribeProviderEvents}
              onApprovalResolved={handleApprovalResolved}
              agentProviderType={latestRun?.providerType}
              agentSessionId={latestRun?.runtimeSessionId}
            />
            {artifactSection}
            <Composer
              workflowId={id}
              taskId={activeTask.id}
              executionStatus={status}
              pendingApproval={pendingApproval}
              queuedMessage={queuedMessageForActive}
              onQueue={(msg) => handleQueue(activeTask.id, msg)}
              onApprovalResolved={handleApprovalResolved}
            />
          </div>
        );
      }

      case "finalizing":
      case "pr-open":
        return (
          <div className="flex flex-col h-full overflow-y-auto">
            {activeTask.artifacts.some((a) => a.kind === "pr") ? (
              <PrTab
                task={activeTask}
                workflowId={id}
                subscribeProviderEvents={subscribeProviderEvents}
              />
            ) : (
              <DraftPrPanel workflowId={id} taskId={activeTask.id} />
            )}
            {artifactSection}
          </div>
        );

      case "merged":
      case "completed":
        return (
          <div className="p-4">
            <div className="card p-4">
              <p className="text-sm font-medium text-fg">Task {status}</p>
              {artifactSection}
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
              {artifactSection}
            </div>
            {status === "failed" && (
              <Composer
                workflowId={id}
                taskId={activeTask.id}
                executionStatus={status}
                pendingApproval={null}
                queuedMessage={null}
                onQueue={(msg) => handleQueue(activeTask.id, msg)}
                onApprovalResolved={handleApprovalResolved}
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
            {artifactSection}
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

      {queueError && (
        <Banner
          tone="error"
          message={`Queued message failed: ${queueError}`}
          className="mx-4 mt-2"
          onDismiss={() => setQueueError(null)}
        />
      )}

      {pushError && (
        <Banner
          tone="error"
          message={pushError}
          className="mx-4 mt-2"
          onDismiss={() => setPushError(null)}
        />
      )}

      <div className="flex flex-col shrink-0 border-b border-border">
        <div className="flex items-center gap-2 px-4 py-2">
          {activeTask && activeTask.runs.length > 0 && (
            <StatusDot
              status={activeTask.executionStatus}
              size="md"
              agentColor={agentTone(activeTask.runs[activeTask.runs.length - 1]!.providerType)}
            />
          )}
          <h1 className="text-sm font-medium text-fg truncate flex-1">{workflowTitle}</h1>
          <CostBadge workflowId={id} subscribeProviderEvents={subscribeProviderEvents} />
          <Pill tone={workflowStatusTone(workflow.status)} className="text-[10px]">
            {workflow.status}
          </Pill>
          <button
            type="button"
            title={pushSubscribed ? "Unsubscribe push" : "Subscribe push"}
            onClick={() => void handleTogglePush()}
            className={`text-xs transition-colors px-1 ${
              pushSubscribed ? "text-accent" : "text-fg-subtle hover:text-fg"
            }`}
          >
            {pushSubscribed ? "★" : "☆"}
          </button>
          <button
            type="button"
            className="text-xs text-fg-muted hover:text-fg transition-colors px-2 py-1 rounded hover:bg-bg-elev"
            onClick={() => setDagOpen(true)}
          >
            Tasks ({Object.keys(workflow.graph).length})
          </button>
        </div>
        {(status === "finalizing" || status === "pr-open" || status === "ci-pending" || status === "merged") && (
          <div className="px-4 pb-1">
            <CompletionStepper executionStatus={status} />
          </div>
        )}
        <OperationsStrip workflow={workflow} />
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
