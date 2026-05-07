import { DomainError } from "../domain/errors.js";
import type { ProviderPlugin } from "../plugins/provider-plugin.js";
import { runProvider } from "../plugins/providers/run-provider.js";
import type { RuntimeBackend } from "../plugins/runtime-backend.js";
import type { Command, CommandResult } from "./commands.js";

export interface RunOrchestratorDeps {
  workflowId: string;
  taskId: string;
  runtimeSessionId: string;
  provider: ProviderPlugin;
  runtime: RuntimeBackend;
  applyCommand: (cmd: Command) => Promise<CommandResult>;
  now: () => string;
  signal?: AbortSignal;
}

export class RunOrchestrator {
  private readonly deps: RunOrchestratorDeps;

  constructor(deps: RunOrchestratorDeps) {
    this.deps = deps;
  }

  async run(): Promise<void> {
    const { workflowId, taskId, runtimeSessionId, provider, runtime, applyCommand, now, signal } = this.deps;

    let latestOffset: number | undefined;
    let latestSessionRef: string | undefined;

    try {
      for await (const item of runProvider(runtime, runtimeSessionId, provider, signal)) {
        if (item.kind === "offset") {
          latestOffset = item.offset;
          continue;
        }

        const event = item.event;

        if (event.kind !== "final") {
          continue;
        }

        const effectiveSessionRef = event.sessionRef || latestSessionRef;

        if (effectiveSessionRef !== undefined || latestOffset !== undefined) {
          const patch: { providerSessionRef?: string; outputOffset?: number } = {};
          if (effectiveSessionRef) patch.providerSessionRef = effectiveSessionRef;
          if (latestOffset !== undefined) patch.outputOffset = latestOffset;

          try {
            await applyCommand({
              kind: "transition-task",
              workflowId,
              transition: { kind: "update-run", taskId, ...patch, now: now() },
            });
          } catch (err) {
            if (err instanceof DomainError && (err.code === "version_conflict" || err.code === "invalid_transition")) {
              console.error("run-orchestrator update-run advisory write skipped:", err.message);
            } else {
              throw err;
            }
          }
        }

        await applyCommand({
          kind: "transition-task",
          workflowId,
          transition: { kind: "complete-runtime", taskId, now: now() },
        });
        return;
      }
    } catch (err) {
      if (latestOffset !== undefined) {
        try {
          await applyCommand({
            kind: "transition-task",
            workflowId,
            transition: { kind: "update-run", taskId, outputOffset: latestOffset, now: now() },
          });
        } catch (updateErr) {
          if (
            !(updateErr instanceof DomainError) ||
            (updateErr.code !== "version_conflict" && updateErr.code !== "invalid_transition")
          ) {
            console.error("run-orchestrator best-effort update-run failed:", updateErr);
          }
        }
      }

      await applyCommand({
        kind: "transition-task",
        workflowId,
        transition: { kind: "mark-interrupted", taskId, now: now() },
      });
      return;
    }

    if (latestOffset !== undefined) {
      try {
        await applyCommand({
          kind: "transition-task",
          workflowId,
          transition: { kind: "update-run", taskId, outputOffset: latestOffset, now: now() },
        });
      } catch (updateErr) {
        if (
          !(updateErr instanceof DomainError) ||
          (updateErr.code !== "version_conflict" && updateErr.code !== "invalid_transition")
        ) {
          console.error("run-orchestrator best-effort update-run failed:", updateErr);
        }
      }
    }

    await applyCommand({
      kind: "transition-task",
      workflowId,
      transition: { kind: "mark-interrupted", taskId, now: now() },
    });
  }
}
