import { describe, it, expect, beforeEach } from "vitest";
import { createCostBadge } from "../../../pwa/assets/components/cost-badge.js";
import type { UsageEvent } from "../../../pwa/assets/components/cost-badge.js";

beforeEach(() => {
  document.body.innerHTML = '';
});

describe("createCostBadge — tier colors", () => {
  it("starts green with zero cost", () => {
    const { element } = createCostBadge({});
    expect(element.classList.contains('cost-badge-green')).toBe(true);
    expect(element.dataset.tier).toBeUndefined();
  });

  it("stays green for cost < $0.01", () => {
    const { element, handleUsageEvent } = createCostBadge({});
    handleUsageEvent({ kind: 'usage', inputTokens: 10, outputTokens: 5, costUsd: 0.005 });
    expect(element.classList.contains('cost-badge-green')).toBe(true);
    expect(element.dataset.tier).toBe('green');
  });

  it("turns yellow when cumulative cost >= $0.01", () => {
    const { element, handleUsageEvent } = createCostBadge({});
    handleUsageEvent({ kind: 'usage', inputTokens: 100, outputTokens: 50, costUsd: 0.01 });
    expect(element.classList.contains('cost-badge-yellow')).toBe(true);
    expect(element.dataset.tier).toBe('yellow');
  });

  it("turns orange when cumulative cost >= $0.10", () => {
    const { element, handleUsageEvent } = createCostBadge({});
    handleUsageEvent({ kind: 'usage', inputTokens: 1000, outputTokens: 500, costUsd: 0.10 });
    expect(element.classList.contains('cost-badge-orange')).toBe(true);
    expect(element.dataset.tier).toBe('orange');
  });

  it("turns red when cumulative cost >= $1.00", () => {
    const { element, handleUsageEvent } = createCostBadge({});
    handleUsageEvent({ kind: 'usage', inputTokens: 10000, outputTokens: 5000, costUsd: 1.00 });
    expect(element.classList.contains('cost-badge-red')).toBe(true);
    expect(element.dataset.tier).toBe('red');
  });

  it("accumulates cost across multiple events", () => {
    const { element, handleUsageEvent } = createCostBadge({});
    handleUsageEvent({ kind: 'usage', inputTokens: 100, outputTokens: 50, costUsd: 0.005 });
    handleUsageEvent({ kind: 'usage', inputTokens: 100, outputTokens: 50, costUsd: 0.005 });
    expect(element.classList.contains('cost-badge-yellow')).toBe(true);
    expect(element.dataset.tier).toBe('yellow');
  });

  it("ignores usage events without costUsd", () => {
    const { element, handleUsageEvent } = createCostBadge({});
    handleUsageEvent({ kind: 'usage', inputTokens: 100, outputTokens: 50 });
    expect(element.classList.contains('cost-badge-green')).toBe(true);
  });

  it("ignores non-usage events", () => {
    const { element, handleUsageEvent } = createCostBadge({});
    handleUsageEvent({ kind: 'assistant_text' } as UsageEvent);
    expect(element.classList.contains('cost-badge-green')).toBe(true);
  });

  it("calls onUsageEvent callback to register handler", () => {
    let registeredHandler: ((e: UsageEvent) => void) | null = null;
    const { element } = createCostBadge({
      onUsageEvent(handler: (e: UsageEvent) => void) {
        registeredHandler = handler;
      },
    });

    expect(registeredHandler).not.toBeNull();
    registeredHandler!({ kind: 'usage', inputTokens: 0, outputTokens: 0, costUsd: 0.05 });
    expect(element.classList.contains('cost-badge-yellow')).toBe(true);
  });
});
