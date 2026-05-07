import { describe, expect, it, vi } from "vitest";
import { orchestratorSilentRule } from "../../../src/supervisor/rules/orchestrator-silent.js";
import { SupervisorState } from "../../../src/supervisor/state.js";
import type { AnomalyRuleContext } from "../../../src/supervisor/rules/index.js";
import { InMemoryWorkflowRepository } from "../../../src/application/repository.js";

const SILENCE_MS = 30 * 60 * 1000;

function makeCtx(fireAlert: AnomalyRuleContext["fireAlert"] = vi.fn(), nowMs = Date.now()): AnomalyRuleContext {
  return {
    now: () => nowMs,
    fireAlert,
    state: new SupervisorState(),
    workflowRepo: new InMemoryWorkflowRepository(),
  };
}

describe("orchestratorSilentRule", () => {
  it("happy path: fires warn when workflow has running task and is silent for 30+ min", async () => {
    const fireAlert = vi.fn();
    const nowMs = 100_000_000;
    const ctx = makeCtx(fireAlert, nowMs);
    ctx.state.activity.set("wf-1", {
      hasRunningTask: true,
      lastEventAt: nowMs - SILENCE_MS - 1,
      lastAlertAt: 0,
    });
    await orchestratorSilentRule.onScan!(ctx);
    expect(fireAlert).toHaveBeenCalledOnce();
    const alert = fireAlert.mock.calls[0]![0];
    expect(alert.kind).toBe("orchestrator-silent");
    expect(alert.severity).toBe("warn");
    expect(alert.workflowId).toBe("wf-1");
  });

  it("does not fire when workflow has no running task", async () => {
    const fireAlert = vi.fn();
    const nowMs = 100_000_000;
    const ctx = makeCtx(fireAlert, nowMs);
    ctx.state.activity.set("wf-1", {
      hasRunningTask: false,
      lastEventAt: nowMs - SILENCE_MS - 1,
      lastAlertAt: 0,
    });
    await orchestratorSilentRule.onScan!(ctx);
    expect(fireAlert).not.toHaveBeenCalled();
  });

  it("does not fire when last event was recent (< 30 min ago)", async () => {
    const fireAlert = vi.fn();
    const nowMs = 100_000_000;
    const ctx = makeCtx(fireAlert, nowMs);
    ctx.state.activity.set("wf-1", {
      hasRunningTask: true,
      lastEventAt: nowMs - SILENCE_MS + 60_000,
      lastAlertAt: 0,
    });
    await orchestratorSilentRule.onScan!(ctx);
    expect(fireAlert).not.toHaveBeenCalled();
  });

  it("deduplicates: does not fire again within 30 min of last alert", async () => {
    const fireAlert = vi.fn();
    const nowMs = 100_000_000;
    const ctx = makeCtx(fireAlert, nowMs);
    ctx.state.activity.set("wf-1", {
      hasRunningTask: true,
      lastEventAt: nowMs - SILENCE_MS - 1,
      lastAlertAt: nowMs - SILENCE_MS + 60_000,
    });
    await orchestratorSilentRule.onScan!(ctx);
    expect(fireAlert).not.toHaveBeenCalled();
  });

  it("sabotage: activity map must have hasRunningTask=true for alert to fire", async () => {
    const fireAlert = vi.fn();
    const nowMs = 100_000_000;
    const ctx = makeCtx(fireAlert, nowMs);
    ctx.state.activity.set("wf-1", {
      hasRunningTask: false,
      lastEventAt: nowMs - SILENCE_MS - 1,
      lastAlertAt: 0,
    });
    await orchestratorSilentRule.onScan!(ctx);
    expect(fireAlert).not.toHaveBeenCalled();
  });
});
