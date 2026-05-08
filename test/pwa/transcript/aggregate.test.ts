import { describe, it, expect } from "vitest";
import { aggregateConsecutive, ClusterGroup } from "../../../pwa/assets/transcript/aggregate.js";

type ProviderEvent = { kind: string; name?: string; id?: string; [key: string]: unknown };

function toolCall(name: string, id = "x"): ProviderEvent {
  return { kind: "tool_call", name, id };
}

function assistantText(text = "hi"): ProviderEvent {
  return { kind: "assistant_text", text };
}

const KINDS = new Set(["tool_call"]);

describe("aggregateConsecutive", () => {
  it("clusters 3 consecutive same-name tool_calls", () => {
    const events: ProviderEvent[] = [toolCall("Read"), toolCall("Read"), toolCall("Read")];
    const result = aggregateConsecutive(events, KINDS, null);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(ClusterGroup);
    const group = result[0] as ClusterGroup;
    expect(group.length).toBe(3);
    expect(group.toolName).toBe("Read");
  });

  it("does not cluster 2 consecutive same-kind events (below threshold)", () => {
    const events: ProviderEvent[] = [toolCall("Read"), toolCall("Read")];
    const result = aggregateConsecutive(events, KINDS, null);
    expect(result).toHaveLength(2);
    expect(result[0]).not.toBeInstanceOf(ClusterGroup);
    expect(result[1]).not.toBeInstanceOf(ClusterGroup);
  });

  it("does not cluster non-consecutive same-name calls", () => {
    const events: ProviderEvent[] = [
      toolCall("Read"),
      assistantText(),
      toolCall("Read"),
      toolCall("Read"),
    ];
    const result = aggregateConsecutive(events, KINDS, null);
    expect(result).toHaveLength(4);
    for (const item of result) {
      expect(item).not.toBeInstanceOf(ClusterGroup);
    }
  });

  it("clusters 5 consecutive Reads into one group", () => {
    const events: ProviderEvent[] = Array.from({ length: 5 }, (_, i) =>
      toolCall("Read", `r${i}`)
    );
    const result = aggregateConsecutive(events, KINDS, null);
    expect(result).toHaveLength(1);
    const group = result[0] as ClusterGroup;
    expect(group).toBeInstanceOf(ClusterGroup);
    expect(group.length).toBe(5);
  });

  it("preserves expansion state across re-clustering when group identity is stable", () => {
    const events: ProviderEvent[] = [
      toolCall("Read", "r1"),
      toolCall("Read", "r2"),
      toolCall("Read", "r3"),
    ];
    const firstResult = aggregateConsecutive(events, KINDS, null);
    const group = firstResult[0] as ClusterGroup;
    group.expanded = true;

    const events2 = [...events, toolCall("Read", "r4")];
    const secondResult = aggregateConsecutive(events2, KINDS, [group]);
    const group2 = secondResult[0] as ClusterGroup;
    expect(group2).toBeInstanceOf(ClusterGroup);
    expect(group2.expanded).toBe(true);
    expect(group2.length).toBe(4);
  });

  it("different tool names do not cluster together", () => {
    const events: ProviderEvent[] = [
      toolCall("Read"),
      toolCall("Read"),
      toolCall("Edit"),
    ];
    const result = aggregateConsecutive(events, KINDS, null);
    expect(result).toHaveLength(3);
    for (const item of result) {
      expect(item).not.toBeInstanceOf(ClusterGroup);
    }
  });

  it("passes non-clusterable events through unchanged", () => {
    const events: ProviderEvent[] = [
      assistantText("hello"),
      assistantText("world"),
      assistantText("foo"),
    ];
    const result = aggregateConsecutive(events, KINDS, null);
    expect(result).toHaveLength(3);
    for (const item of result) {
      expect(item).not.toBeInstanceOf(ClusterGroup);
    }
  });

  it("mixed sequence: cluster in the middle, individual events on sides", () => {
    const events: ProviderEvent[] = [
      assistantText("intro"),
      toolCall("Read", "r1"),
      toolCall("Read", "r2"),
      toolCall("Read", "r3"),
      assistantText("outro"),
    ];
    const result = aggregateConsecutive(events, KINDS, null);
    expect(result).toHaveLength(3);
    expect(result[0]).not.toBeInstanceOf(ClusterGroup);
    expect(result[1]).toBeInstanceOf(ClusterGroup);
    expect(result[2]).not.toBeInstanceOf(ClusterGroup);
  });
});
