import type { RuntimeBackend } from "../plugins/runtime-backend.js";
import type { RuntimeProbeState } from "./recovery.js";
import type { RecoveryService } from "./recovery-service.js";
import type { WorkflowRepository } from "./repository.js";

export interface BootRecoveryOptions {
  now: () => string;
  staleReadyMs: number;
  staleGateMs: number;
}

export interface BootRecoveryFailure {
  workflowId: string;
  phase: "probe" | "scan";
  error: string;
}

export interface BootRecoveryReport {
  workflowsScanned: number;
  failures: BootRecoveryFailure[];
}

export async function runBootRecovery(
  repo: WorkflowRepository,
  recoveryService: RecoveryService,
  runtime: RuntimeBackend,
  options: BootRecoveryOptions,
): Promise<BootRecoveryReport> {
  const workflows = await repo.listRecoverable();
  const report: BootRecoveryReport = { workflowsScanned: 0, failures: [] };

  for (const workflow of workflows) {
    const runtimeProbes: Record<string, RuntimeProbeState> = {};
    let probeFailed = false;

    for (const task of Object.values(workflow.graph)) {
      if (!task.sessionId) continue;
      try {
        runtimeProbes[task.sessionId] = await runtime.probe(task.sessionId);
      } catch (err) {
        report.failures.push({
          workflowId: workflow.id,
          phase: "probe",
          error: err instanceof Error ? err.message : String(err),
        });
        probeFailed = true;
        break;
      }
    }

    if (probeFailed) continue;

    try {
      await recoveryService.scan(workflow.id, {
        nowMs: Date.parse(options.now()),
        staleReadyMs: options.staleReadyMs,
        staleGateMs: options.staleGateMs,
        runtimeProbes,
        workflowCancelled: workflow.status === "cancelled",
      });
      report.workflowsScanned += 1;
    } catch (err) {
      report.failures.push({
        workflowId: workflow.id,
        phase: "scan",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return report;
}
