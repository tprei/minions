import type { ProviderEvent } from "../domain/providerEvent";

export const CLUSTER_MIN = 3;

export class ClusterGroup {
  kind: ProviderEvent["kind"];
  toolName: string | undefined;
  events: ProviderEvent[];
  expanded: boolean;
  _id: string | undefined;

  constructor(kind: ProviderEvent["kind"], toolName: string | undefined) {
    this.kind = kind;
    this.toolName = toolName;
    this.events = [];
    this.expanded = false;
    this._id = undefined;
  }

  push(event: ProviderEvent): void {
    this.events.push(event);
  }

  get length(): number {
    return this.events.length;
  }
}

export type AggregateItem = ProviderEvent | ClusterGroup;

const CLUSTERABLE_KINDS: ReadonlySet<ProviderEvent["kind"]> = new Set([
  "tool_call",
  "tool_result",
]);

function clusterKey(event: ProviderEvent): string | null {
  if (!CLUSTERABLE_KINDS.has(event.kind)) return null;
  if (event.kind === "tool_call") return `tool_call:${event.name}`;
  return event.kind;
}

export function aggregateConsecutive(
  events: ProviderEvent[],
  previousGroups?: AggregateItem[],
): AggregateItem[] {
  const groupById = new Map<string, ClusterGroup>();
  if (previousGroups) {
    for (const item of previousGroups) {
      if (item instanceof ClusterGroup && item._id !== undefined) {
        groupById.set(item._id, item);
      }
    }
  }

  const result: AggregateItem[] = [];
  let i = 0;

  while (i < events.length) {
    const ev = events[i];
    const key = clusterKey(ev);

    if (key === null) {
      result.push(ev);
      i++;
      continue;
    }

    let runLen = 1;
    while (
      i + runLen < events.length &&
      clusterKey(events[i + runLen]) === key
    ) {
      runLen++;
    }

    if (runLen < CLUSTER_MIN) {
      for (let j = 0; j < runLen; j++) {
        result.push(events[i + j]);
      }
      i += runLen;
      continue;
    }

    const runEvents = events.slice(i, i + runLen);
    const groupId = `${key}:${i}`;

    let group = groupById.get(groupId);
    if (!group) {
      const toolName = ev.kind === "tool_call" ? ev.name : undefined;
      group = new ClusterGroup(ev.kind, toolName);
      group._id = groupId;
    }

    group.events = runEvents;
    result.push(group);
    i += runLen;
  }

  return result;
}
