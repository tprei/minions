import type { RuntimeBackend } from "../plugins/runtime-backend.js";
import type { RuntimeProbeState } from "./recovery.js";
import type { RecoveryService } from "./recovery-service.js";
import type { WorkflowRepository } from "./repository.js";

export interface BootRecoveryOptions {
  now: () => string;
  staleReadyMs: number;
  staleGateMs: number;
}

export async function runBootRecovery(
  repo: WorkflowRepository,
  recoveryService: RecoveryService,
  runtime: RuntimeBackend,
  options: BootRecoveryOptions,
): Promise<void> {
  const workflows = await repo.listRecoverable();

  for (const workflow of workflows) {
    const runtimeProbes: Record<string, RuntimeProbeState> = {};

    for (const task of Object.values(workflow.graph)) {
      if (task.sessionId) {
        runtimeProbes[task.sessionId] = await runtime.probe(task.sessionId);
      }
    }

    await recoveryService.scan(workflow.id, {
      nowMs: Date.parse(options.now()),
      staleReadyMs: options.staleReadyMs,
      staleGateMs: options.staleGateMs,
      runtimeProbes,
      workflowCancelled: workflow.status === "cancelled",
    });
  }
}
