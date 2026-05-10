import { useEffect, useRef, useState, useCallback } from "react";
import type { ProviderEvent } from "../domain/providerEvent";
import type { WorkflowEvent } from "../domain/types";
import { subscribeWorkflow } from "../transport/sse";
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

interface Props {
  workflowId: string;
  taskId: string;
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
}: {
  item: AggregateItem;
  workflowId: string;
  taskId: string;
  clusterState: Map<string, ClusterState>;
  onClusterToggle: (id: string) => void;
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
          />
        ))}
      </div>
    );
  }

  const ev = item;

  switch (ev.kind) {
    case "assistant_text":
      return <AssistantText text={ev.text} />;
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
        />
      );
    default:
      return null;
  }
}

export function TranscriptView({ workflowId, taskId }: Props): JSX.Element {
  const [events, setEvents] = useState<ProviderEvent[]>([]);
  const [aggregated, setAggregated] = useState<AggregateItem[]>([]);
  const [clusterState, setClusterState] = useState<Map<string, ClusterState>>(new Map());
  const previousGroupsRef = useRef<AggregateItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  const handleClusterToggle = useCallback((id: string) => {
    setClusterState((prev) => {
      const next = new Map(prev);
      const cur = next.get(id) ?? { expanded: false };
      next.set(id, { expanded: !cur.expanded });
      return next;
    });
  }, []);

  useEffect(() => {
    const buffer = createStreamingBuffer((batch) => {
      setEvents((prev) => {
        const next = [...prev, ...batch];
        const groups = aggregateConsecutive(next, previousGroupsRef.current);
        previousGroupsRef.current = groups;
        setAggregated(groups);
        return next;
      });
    });

    const sub = subscribeWorkflow(workflowId, {
      onEvent(evt: WorkflowEvent) {
        if (evt.kind !== "provider-event") return;
        if (evt.payload.taskId !== taskId) return;
        buffer.push(evt.payload.providerEvent as ProviderEvent);
      },
    });

    return () => {
      buffer.stop();
      sub.close();
    };
  }, [workflowId, taskId]);

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
        />
      ))}
      {events.length === 0 && (
        <p className="text-xs text-fg-subtle text-center py-8">Waiting for agent…</p>
      )}
    </div>
  );
}
