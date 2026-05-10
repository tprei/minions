import { describe, it, expect } from "vitest";
import { aggregateConsecutive, ClusterGroup, CLUSTER_MIN } from "../aggregate";
import type { ProviderEvent } from "../../domain/providerEvent";

function toolCall(name: string, index: number): ProviderEvent {
  return { kind: "tool_call", id: `tc-${index}`, name, input: {} };
}

function toolResult(index: number): ProviderEvent {
  return { kind: "tool_result", id: `tr-${index}`, output: "ok" };
}

function assistantText(index: number): ProviderEvent {
  return { kind: "assistant_text", text: `text ${index}` };
}

describe("aggregateConsecutive", () => {
  it("does not cluster when fewer than CLUSTER_MIN consecutive same-kind events", () => {
    const events: ProviderEvent[] = [
      toolCall("bash", 0),
      toolCall("bash", 1),
    ];
    const result = aggregateConsecutive(events);
    expect(result).toHaveLength(2);
    expect(result[0]).not.toBeInstanceOf(ClusterGroup);
    expect(result[1]).not.toBeInstanceOf(ClusterGroup);
  });

  it(`clusters at exactly ${CLUSTER_MIN} consecutive same-kind events`, () => {
    const events: ProviderEvent[] = Array.from({ length: CLUSTER_MIN }, (_, i) =>
      toolCall("bash", i),
    );
    const result = aggregateConsecutive(events);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(ClusterGroup);
    const group = result[0] as ClusterGroup;
    expect(group.events).toHaveLength(CLUSTER_MIN);
    expect(group.kind).toBe("tool_call");
  });

  it("clusters more than CLUSTER_MIN events into a single group", () => {
    const events: ProviderEvent[] = Array.from({ length: 7 }, (_, i) => toolCall("read", i));
    const result = aggregateConsecutive(events);
    expect(result).toHaveLength(1);
    const group = result[0] as ClusterGroup;
    expect(group.events).toHaveLength(7);
  });

  it("does not cluster mixed kinds even when each run has >= CLUSTER_MIN", () => {
    const events: ProviderEvent[] = [
      ...Array.from({ length: 3 }, (_, i) => toolCall("bash", i)),
      ...Array.from({ length: 3 }, (_, i) => toolCall("read", i + 10)),
    ];
    const result = aggregateConsecutive(events);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(ClusterGroup);
    expect(result[1]).toBeInstanceOf(ClusterGroup);
    expect((result[0] as ClusterGroup).toolName).toBe("bash");
    expect((result[1] as ClusterGroup).toolName).toBe("read");
  });

  it("passes through non-clusterable events without grouping", () => {
    const events: ProviderEvent[] = [
      assistantText(0),
      assistantText(1),
      assistantText(2),
      assistantText(3),
    ];
    const result = aggregateConsecutive(events);
    expect(result).toHaveLength(4);
    result.forEach((item) => expect(item).not.toBeInstanceOf(ClusterGroup));
  });

  it("handles interleaved non-clusterable events breaking a run", () => {
    const events: ProviderEvent[] = [
      toolCall("bash", 0),
      toolCall("bash", 1),
      assistantText(0),
      toolCall("bash", 2),
      toolCall("bash", 3),
      toolCall("bash", 4),
    ];
    const result = aggregateConsecutive(events);
    // First two bash calls: run of 2 < CLUSTER_MIN → individual
    // assistant_text: passthrough
    // Last three bash calls: run of 3 >= CLUSTER_MIN → cluster
    expect(result).toHaveLength(4);
    expect(result[0]).not.toBeInstanceOf(ClusterGroup);
    expect(result[1]).not.toBeInstanceOf(ClusterGroup);
    expect(result[2]).not.toBeInstanceOf(ClusterGroup);
    expect(result[3]).toBeInstanceOf(ClusterGroup);
    expect((result[3] as ClusterGroup).events).toHaveLength(3);
  });

  it("clusters tool_result events when CLUSTER_MIN consecutive", () => {
    const events = Array.from({ length: 3 }, (_, i) => toolResult(i));
    const result = aggregateConsecutive(events);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(ClusterGroup);
    expect((result[0] as ClusterGroup).kind).toBe("tool_result");
  });

  it("preserves expanded state from previousGroups", () => {
    const events: ProviderEvent[] = Array.from({ length: 3 }, (_, i) => toolCall("bash", i));
    const first = aggregateConsecutive(events);
    const group = first[0] as ClusterGroup;
    group.expanded = true;

    const second = aggregateConsecutive(events, first);
    const secondGroup = second[0] as ClusterGroup;
    expect(secondGroup.expanded).toBe(true);
  });
});
