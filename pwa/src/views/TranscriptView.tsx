import { useEffect, useRef, useState, useCallback } from "react";
import type { ProviderEvent } from "../domain/providerEvent";
import type { TranscriptEvent, WorkflowEvent } from "../domain/types";
import { aggregateConsecutive, ClusterGroup, type AggregateItem } from "../transcript/aggregate";
import { createStreamingBuffer } from "../transcript/streaming";
import { AssistantText } from "../transcript/events/assistant-text";
import { Thinking } from "../transcript/events/thinking";
import { ToolCall } from "../transcript/events/tool-call";
import { ToolResult } from "../transcript/events/tool-result";
import { Usage } from "../transcript/events/usage";
import { TranscriptError } from "../transcript/events/error";
import { Final } from "../transcript/events/final";
import { Approval } from "../transcript/events/approval";
import { ClusterHeader } from "../transcript/events/cluster-header";
import { getTaskTranscript } from "../transport/rest";
import { useConnectionStore } from "../store/useConnectionStore";

export type ProviderEventListener = (evt: WorkflowEvent) => void;
export type ProviderEventSubscriber = (listener: ProviderEventListener) => () => void;

interface Props {
  workflowId: string;
  taskId: string;
  subscribeProviderEvents: ProviderEventSubscriber;
  onApprovalResolved?: () => void;
  agentProviderType?: string;
  agentSessionId?: string;
}

interface ClusterState {
  expanded: boolean;
}

function EventRow({
  item,
  workflowId,
  taskId,
  clusterState,
  onClusterToggle,
  onApprovalResolved,
  agentProviderType,
  agentSessionId,
}: {
  item: AggregateItem;
  workflowId: string;
  taskId: string;
  clusterState: Map<string, ClusterState>;
  onClusterToggle: (id: string) => void;
  onApprovalResolved?: () => void;
  agentProviderType?: string;
  agentSessionId?: string;
}): JSX.Element | null {
  if (item instanceof ClusterGroup) {
    const id = item._id ?? "";
    const state = clusterState.get(id) ?? { expanded: false };
    return (
      <div className="te-cluster border-l-2 border-border/50 pl-2 py-1 space-y-1">
        <ClusterHeader group={item} expanded={state.expanded} onToggle={() => onClusterToggle(id)} />
        {state.expanded && item.events.map((ev, i) => (
          <EventRow
            key={i}
            item={ev}
            workflowId={workflowId}
            taskId={taskId}
            clusterState={clusterState}
            onClusterToggle={onClusterToggle}
            onApprovalResolved={onApprovalResolved}
            agentProviderType={agentProviderType}
            agentSessionId={agentSessionId}
          />
        ))}
      </div>
    );
  }

  const ev = item;

  switch (ev.kind) {
    case "assistant_text":
      return (
        <AssistantText
          text={ev.text}
          agentProviderType={agentProviderType}
          agentSessionId={agentSessionId}
        />
      );
    case "thinking":
      return <Thinking text={ev.text} />;
    case "tool_call":
      return <ToolCall id={ev.id} name={ev.name} input={ev.input} />;
    case "tool_result":
      return <ToolResult id={ev.id} output={ev.output} isError={ev.isError} />;
    case "usage":
      return (
        <Usage
          inputTokens={ev.inputTokens}
          outputTokens={ev.outputTokens}
          cachedInputTokens={ev.cachedInputTokens}
          reasoningTokens={ev.reasoningTokens}
          costUsd={ev.costUsd}
        />
      );
    case "error":
      return <TranscriptError message={ev.message} recoverable={ev.recoverable} />;
    case "final":
      return <Final sessionRef={ev.sessionRef} exitMetadata={ev.exitMetadata} />;
    case "permission_request":
      return (
        <Approval
          id={ev.id}
          tool={ev.tool}
          input={ev.input}
          workflowId={workflowId}
          taskId={taskId}
          onResolved={onApprovalResolved}
        />
      );
    default:
      return null;
  }
}

export function TranscriptView({
  workflowId,
  taskId,
  subscribeProviderEvents,
  onApprovalResolved,
  agentProviderType,
  agentSessionId,
}: Props): JSX.Element {
  const [events, setEvents] = useState<ProviderEvent[]>([]);
  const [aggregated, setAggregated] = useState<AggregateItem[]>([]);
  const [clusterState, setClusterState] = useState<Map<string, ClusterState>>(new Map());
  const previousGroupsRef = useRef<AggregateItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  const historyLoadedRef = useRef(false);
  const liveBufferRef = useRef<TranscriptEvent[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const connectionState = useConnectionStore((s) => s.state);

  const handleClusterToggle = useCallback((id: string) => {
    setClusterState((prev) => {
      const next = new Map(prev);
      const cur = next.get(id) ?? { expanded: false };
      next.set(id, { expanded: !cur.expanded });
      return next;
    });
  }, []);

  const appendProviderEvents = useCallback((incoming: ProviderEvent[]) => {
    if (incoming.length === 0) return;
    setEvents((prev) => {
      const next = [...prev, ...incoming];
      const groups = aggregateConsecutive(next, previousGroupsRef.current);
      previousGroupsRef.current = groups;
      setAggregated(groups);
      return next;
    });
  }, []);

  useEffect(() => {
    setEvents([]);
    setAggregated([]);
    previousGroupsRef.current = [];
    historyLoadedRef.current = false;
    liveBufferRef.current = [];
    seenIdsRef.current = new Set();

    const buffer = createStreamingBuffer((batch) => {
      appendProviderEvents(batch);
    });

    const unsub = subscribeProviderEvents((evt) => {
      if (evt.kind !== "provider-event") return;
      if (evt.payload.taskId !== taskId) return;
      const pe = evt.payload.providerEvent as ProviderEvent;
      const seq = evt.payload.seq ?? -1;
      const runId = evt.payload.runId;
      const dedupeKey = `${runId}:${seq}`;

      if (historyLoadedRef.current) {
        if (!seenIdsRef.current.has(dedupeKey)) {
          seenIdsRef.current.add(dedupeKey);
          buffer.push(pe);
        }
      } else {
        if (!seenIdsRef.current.has(dedupeKey)) {
          const te: TranscriptEvent = { runId, attempt: 0, seq, event: pe };
          liveBufferRef.current.push(te);
          seenIdsRef.current.add(dedupeKey);
        }
      }
    });

    let cancelled = false;

    getTaskTranscript(workflowId, taskId)
      .then((result) => {
        if (cancelled) return;

        const historyEvents = result.events.filter((te) => {
          const key = `${te.runId}:${te.seq}`;
          return !seenIdsRef.current.has(key);
        });

        for (const te of historyEvents) {
          seenIdsRef.current.add(`${te.runId}:${te.seq}`);
        }

        const historyProviderEvents = historyEvents.map((te) => te.event);

        setEvents([]);
        setAggregated([]);
        previousGroupsRef.current = [];

        if (historyProviderEvents.length > 0) {
          appendProviderEvents(historyProviderEvents);
        }

        const drainedLive = liveBufferRef.current;
        liveBufferRef.current = [];
        historyLoadedRef.current = true;

        const newLive = drainedLive
          .filter((te) => !historyEvents.some((h) => h.runId === te.runId && h.seq === te.seq))
          .map((te) => te.event);

        if (newLive.length > 0) {
          appendProviderEvents(newLive);
        }
      })
      .catch(() => {
        if (!cancelled) {
          historyLoadedRef.current = true;
          liveBufferRef.current = [];
        }
      });

    return () => {
      cancelled = true;
      buffer.stop();
      unsub();
    };
  }, [workflowId, taskId, subscribeProviderEvents, appendProviderEvents]);

  useEffect(() => {
    if (connectionState !== "connected") return;
    if (!historyLoadedRef.current) return;

    let cancelled = false;
    getTaskTranscript(workflowId, taskId)
      .then((result) => {
        if (cancelled) return;

        const newEvents = result.events.filter((te) => {
          const key = `${te.runId}:${te.seq}`;
          return !seenIdsRef.current.has(key);
        });

        if (newEvents.length === 0) return;

        for (const te of newEvents) {
          seenIdsRef.current.add(`${te.runId}:${te.seq}`);
        }

        appendProviderEvents(newEvents.map((te) => te.event));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [connectionState, workflowId, taskId, appendProviderEvents]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [aggregated]);

  function handleScroll(): void {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = Math.abs(el.scrollTop + el.clientHeight - el.scrollHeight) <= 8;
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      onScroll={handleScroll}
    >
      {aggregated.map((item, i) => (
        <EventRow
          key={i}
          item={item}
          workflowId={workflowId}
          taskId={taskId}
          clusterState={clusterState}
          onClusterToggle={handleClusterToggle}
          onApprovalResolved={onApprovalResolved}
          agentProviderType={agentProviderType}
          agentSessionId={agentSessionId}
        />
      ))}
      {events.length === 0 && (
        <p className="text-xs text-fg-subtle text-center py-8">Waiting for agent…</p>
      )}
    </div>
  );
}
