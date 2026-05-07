import { DomainError } from "../domain/errors.js";
import type { ProviderEvent, ProviderPlugin } from "../plugins/provider-plugin.js";
import { runProvider } from "../plugins/providers/run-provider.js";
import type { RunProviderOptions } from "../plugins/providers/run-provider.js";
import type { RuntimeBackend } from "../plugins/runtime-backend.js";
import type { Command, CommandResult } from "./commands.js";
import type { TransitionCommand } from "./transitions.js";

export interface RunOrchestratorDeps {
  workflowId: string;
  taskId: string;
  runId: string;
  runtimeSessionId: string;
  provider: ProviderPlugin;
  runtime: RuntimeBackend;
  applyCommand: (cmd: Command) => Promise<CommandResult>;
  publish: (event: ProviderEvent) => void;
  now: () => string;
  signal?: AbortSignal;
  fromOffset?: number;
}

export class RunOrchestrator {
  private readonly deps: RunOrchestratorDeps;

  constructor(deps: RunOrchestratorDeps) {
    this.deps = deps;
  }

  private async dispatchWithRetry(
    transition: Omit<TransitionCommand, "expectedSessionId">,
    attempts = 3,
  ): Promise<void> {
    const { workflowId, runtimeSessionId, applyCommand } = this.deps;
    for (let i = 0; i < attempts; i++) {
      try {
        await applyCommand({
          kind: "transition-task",
          workflowId,
          transition: { ...transition, expectedSessionId: runtimeSessionId },
        });
        return;
      } catch (err) {
        if (err instanceof DomainError && err.code === "version_conflict" && i < attempts - 1) {
          await new Promise((r) => setTimeout(r, 10));
          continue;
        }
        throw err;
      }
    }
  }

  async run(): Promise<void> {
    const { workflowId, taskId, runtimeSessionId, provider, runtime, applyCommand, now } = this.deps;

    let latestOffset: number | undefined;
    let latestSessionRef: string | undefined;
    let lastNonRecoverableError: ProviderEvent | undefined;
    let finalReceived = false;

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

    const providerOpts: RunProviderOptions = {};
    if (this.deps.signal !== undefined) providerOpts.signal = this.deps.signal;
    if (this.deps.fromOffset !== undefined) providerOpts.fromOffset = this.deps.fromOffset;

    try {
      for await (const item of runProvider(runtime, runtimeSessionId, provider, providerOpts)) {
        if (item.kind === "offset") {
          latestOffset = item.offset;
          continue;
        }

        const event = item.event;

        // set finalReceived before publish so a publish throw on final still marks final as seen
        if (event.kind === "final") finalReceived = true;
        this.deps.publish(event);

        if (event.kind === "error" && !event.recoverable) {
          lastNonRecoverableError = event;
          continue;
        }

        if (event.kind !== "final") {
          continue;
        }
        const effectiveSessionRef = event.sessionRef || latestSessionRef;

        // Only persist providerSessionRef on the success path — never outputOffset.
        // outputOffset is for resume on interrupted runs; writing it here would advance
        // the offset past final before complete-runtime is durable, causing a
        // crash-between-update-run-and-complete-runtime to miss the final on re-spawn.
        if (effectiveSessionRef !== undefined) {
          try {
            await dispatch({ kind: "update-run", taskId, providerSessionRef: effectiveSessionRef, now: now() });
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
            await this.dispatchWithRetry({ kind: "mark-interrupted", taskId, now: now() });
          } catch (err) {
            if (isStale(err)) {
              console.error("run-orchestrator stale session on mark-interrupted, exiting:", (err as DomainError).message);
              return;
            }
            throw err;
          }
        } else {
          try {
            await this.dispatchWithRetry({ kind: "complete-runtime", taskId, now: now() });
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
      // Graceful shutdown: signal was aborted, leave the task running so boot can re-spawn it.
      if (this.deps.signal?.aborted === true) {
        console.error("run-orchestrator exiting due to signal abort, leaving task running");
        return;
      }

      if (!finalReceived && latestOffset !== undefined) {
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
        await this.dispatchWithRetry({ kind: "mark-interrupted", taskId, now: now() });
      } catch (interruptErr) {
        if (isStale(interruptErr)) {
          console.error("run-orchestrator stale session on mark-interrupted, exiting:", (interruptErr as DomainError).message);
          return;
        }
        throw interruptErr;
      }
      return;
    }

    // Graceful shutdown: signal was aborted, leave the task running so boot can re-spawn it.
    if (this.deps.signal?.aborted === true) {
      console.error("run-orchestrator exiting due to signal abort, leaving task running");
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
      await this.dispatchWithRetry({ kind: "mark-interrupted", taskId, now: now() });
    } catch (interruptErr) {
      if (isStale(interruptErr)) {
        console.error("run-orchestrator stale session on mark-interrupted, exiting:", (interruptErr as DomainError).message);
        return;
      }
      throw interruptErr;
    }
  }
}
