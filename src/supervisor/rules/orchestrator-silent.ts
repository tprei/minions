// Fires when a workflow has a running task but no log events for 30 minutes.
// Depends on ObservabilityService feeding workflow events into the log pipeline.
// Scan-only rule that checks activity timestamps.
import type { AnomalyRule, AnomalyRuleContext } from "./index.js";

const SILENCE_MS = 30 * 60 * 1000;

export const orchestratorSilentRule: AnomalyRule = {
  id: "orchestrator-silent",
  async onScan(ctx: AnomalyRuleContext): Promise<void> {
    const now = ctx.now();
    for (const [workflowId, activity] of ctx.state.activity) {
      if (!activity.hasRunningTask) continue;
      if (now - activity.lastEventAt < SILENCE_MS) continue;
      if (now - activity.lastAlertAt < SILENCE_MS) continue;
      activity.lastAlertAt = now;
      ctx.fireAlert({
        kind: "orchestrator-silent",
        severity: "warn",
        message: `Orchestrator silent for workflow ${workflowId}: no events in 30 minutes`,
        workflowId,
        detail: { lastEventAt: new Date(activity.lastEventAt).toISOString() },
      });
    }
  },
};
