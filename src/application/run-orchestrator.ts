import { DomainError } from "../domain/errors.js";
import type { ProviderEvent, ProviderPlugin } from "../plugins/provider-plugin.js";
import { runProvider } from "../plugins/providers/run-provider.js";
import type { RuntimeBackend } from "../plugins/runtime-backend.js";
import type { Command, CommandResult } from "./commands.js";
import type { TransitionCommand } from "./transitions.js";

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
    let lastNonRecoverableError: ProviderEvent | undefined;

    const dispatch = async (transition: Omit<TransitionCommand, "expectedSessionId">): Promise<void> => {
      await applyCommand({
        kind: "transition-task",
        workflowId,
        transition: { ...transition, expectedSessionId: runtimeSessionId },
      });
    };

    const isAdvisory = (err: unknown): boolean =>
      err instanceof DomainError &&
      (err.code === "version_conflict" || err.code === "invalid_transition" || err.code === "session_mismatch");

    const isStale = (err: unknown): boolean =>
      err instanceof DomainError && err.code === "session_mismatch";

    try {
      for await (const item of runProvider(runtime, runtimeSessionId, provider, signal)) {
        if (item.kind === "offset") {
          latestOffset = item.offset;
          continue;
        }

        const event = item.event;

        if (event.kind === "error" && !event.recoverable) {
          lastNonRecoverableError = event;
          continue;
        }

        if (event.kind !== "final") {
          continue;
        }

        const effectiveSessionRef = event.sessionRef || latestSessionRef;

        if (effectiveSessionRef !== undefined || latestOffset !== undefined) {
          const patch: { providerSessionRef?: string; outputOffset?: number } = {};
          if (effectiveSessionRef) patch.providerSessionRef = effectiveSessionRef;
          if (latestOffset !== undefined) patch.outputOffset = latestOffset;

          try {
            await dispatch({ kind: "update-run", taskId, ...patch, now: now() });
          } catch (err) {
            if (isStale(err)) {
              console.error("run-orchestrator stale session on update-run, exiting:", (err as DomainError).message);
              return;
            }
            if (!isAdvisory(err)) throw err;
            console.error("run-orchestrator update-run advisory write skipped:", (err as Error).message);
          }
        }

        if (lastNonRecoverableError !== undefined) {
          try {
            await dispatch({ kind: "mark-interrupted", taskId, now: now() });
          } catch (err) {
            if (isStale(err)) {
              console.error("run-orchestrator stale session on mark-interrupted, exiting:", (err as DomainError).message);
              return;
            }
            throw err;
          }
        } else {
          try {
            await dispatch({ kind: "complete-runtime", taskId, now: now() });
          } catch (err) {
            if (isStale(err)) {
              console.error("run-orchestrator stale session on complete-runtime, exiting:", (err as DomainError).message);
              return;
            }
            throw err;
          }
        }
        return;
      }
    } catch (err) {
      if (latestOffset !== undefined) {
        try {
          await dispatch({ kind: "update-run", taskId, outputOffset: latestOffset, now: now() });
        } catch (updateErr) {
          if (isStale(updateErr)) {
            console.error("run-orchestrator stale session on best-effort update-run, exiting:", (updateErr as DomainError).message);
            return;
          }
          if (!isAdvisory(updateErr)) {
            console.error("run-orchestrator best-effort update-run failed:", updateErr);
          }
        }
      }

      try {
        await dispatch({ kind: "mark-interrupted", taskId, now: now() });
      } catch (interruptErr) {
        if (isStale(interruptErr)) {
          console.error("run-orchestrator stale session on mark-interrupted, exiting:", (interruptErr as DomainError).message);
          return;
        }
        throw interruptErr;
      }
      return;
    }

    if (latestOffset !== undefined) {
      try {
        await dispatch({ kind: "update-run", taskId, outputOffset: latestOffset, now: now() });
      } catch (updateErr) {
        if (isStale(updateErr)) {
          console.error("run-orchestrator stale session on best-effort update-run, exiting:", (updateErr as DomainError).message);
          return;
        }
        if (!isAdvisory(updateErr)) {
          console.error("run-orchestrator best-effort update-run failed:", updateErr);
        }
      }
    }

    try {
      await dispatch({ kind: "mark-interrupted", taskId, now: now() });
    } catch (interruptErr) {
      if (isStale(interruptErr)) {
        console.error("run-orchestrator stale session on mark-interrupted, exiting:", (interruptErr as DomainError).message);
        return;
      }
      throw interruptErr;
    }
  }
}
