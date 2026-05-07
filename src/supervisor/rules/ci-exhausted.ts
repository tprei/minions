// Fires when a task hit the CI attempt cap and is still in pr-open state.
// Two-phase: kind:"ci-attempt-cap" records the task; scan checks if still stuck.
import type { AnomalyRule, AnomalyRuleContext } from "./index.js";
import type { LogRecord } from "../../observability/types.js";

export const ciExhaustedRule: AnomalyRule = {
  id: "ci-exhausted",
  onLogRecord(record: LogRecord, ctx: AnomalyRuleContext): void {
    if (record["kind"] !== "ci-attempt-cap") return;
    const taskId = typeof record["taskId"] === "string" ? record["taskId"] : undefined;
    if (taskId === undefined) return;
    if (!ctx.state.pendingCiExhaustion.has(taskId)) {
      ctx.state.pendingCiExhaustion.set(taskId, { since: ctx.now(), alerted: false });
    }
  },
  async onScan(ctx: AnomalyRuleContext): Promise<void> {
    for (const [taskId, entry] of ctx.state.pendingCiExhaustion) {
      if (entry.alerted) continue;
      const workflows = await ctx.workflowRepo.list({ includeCompleted: false });
      let foundWorkflowId: string | undefined;
      for (const wf of workflows) {
        const task = wf.graph[taskId];
        if (task !== undefined && task.executionStatus === "pr-open") {
          foundWorkflowId = wf.id;
          break;
        }
      }
      if (foundWorkflowId !== undefined) {
        entry.alerted = true;
        ctx.fireAlert({
          kind: "ci-exhausted",
          severity: "error",
          message: `CI attempt cap reached and task ${taskId} is still in pr-open`,
          workflowId: foundWorkflowId,
          taskId,
          detail: { since: new Date(entry.since).toISOString() },
        });
      }
    }
  },
};
