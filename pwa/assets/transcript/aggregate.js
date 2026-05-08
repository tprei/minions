export const CLUSTER_MIN = 3;

export class ClusterGroup {
  constructor(kind, toolName) {
    this.kind = kind;
    this.toolName = toolName;
    this.events = [];
    this.expanded = false;
  }

  push(event) {
    this.events.push(event);
  }

  get length() {
    return this.events.length;
  }
}

function clusterKey(event, kindsToCluster) {
  if (!kindsToCluster.has(event.kind)) return null;
  if (event.kind === "tool_call") return `tool_call:${event.name ?? ""}`;
  return event.kind;
}

export function aggregateConsecutive(events, kindsToCluster, previousGroups) {
  const groupById = new Map();
  if (previousGroups) {
    for (const item of previousGroups) {
      if (item instanceof ClusterGroup && item._id !== undefined) {
        groupById.set(item._id, item);
      }
    }
  }

  const result = [];
  let i = 0;

  while (i < events.length) {
    const ev = events[i];
    const key = clusterKey(ev, kindsToCluster);

    if (key === null) {
      result.push(ev);
      i++;
      continue;
    }

    let runLen = 1;
    while (
      i + runLen < events.length &&
      clusterKey(events[i + runLen], kindsToCluster) === key
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
      const toolName = ev.kind === "tool_call" ? (ev.name ?? "") : undefined;
      group = new ClusterGroup(ev.kind, toolName);
      group._id = groupId;
    }

    group.events = runEvents;
    result.push(group);
    i += runLen;
  }

  return result;
}
