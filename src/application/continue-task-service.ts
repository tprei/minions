import { DomainError } from "../domain/errors.js";
import type { ProviderPlugin } from "../plugins/provider-plugin.js";
import type { RuntimeBackend } from "../plugins/runtime-backend.js";
import type { Command, CommandResult } from "./commands.js";
import type { WorkflowRepository } from "./repository.js";
import { RunOrchestrator } from "./run-orchestrator.js";
import { getOpenRun } from "../domain/runs.js";
import type { WorkflowEvent } from "../domain/events.js";

export interface ContinueTaskServiceDeps {
  repo: WorkflowRepository;
  applyCommand: (cmd: Command) => Promise<CommandResult>;
  providerFactory: () => ProviderPlugin;
  runtime: RuntimeBackend;
  now: () => string;
}

export interface ContinueTaskInput {
  workflowId: string;
  taskId: string;
  prompt: string;
}

export class ContinueTaskService {
  private readonly deps: ContinueTaskServiceDeps;

  constructor(deps: ContinueTaskServiceDeps) {
    this.deps = deps;
  }

  async run(input: ContinueTaskInput): Promise<CommandResult> {
    const { workflowId, taskId, prompt } = input;
    const { repo, applyCommand, providerFactory, runtime, now } = this.deps;

    const workflow = await repo.get(workflowId);
    if (!workflow) {
      throw new DomainError("not_found", "workflow not found", { workflowId });
    }

    const task = workflow.graph[taskId];
    if (!task) {
      throw new DomainError("not_found", "task not found", { taskId });
    }

    let priorSessionRef: string | undefined;
    for (let i = task.runs.length - 1; i >= 0; i--) {
      const run = task.runs[i];
      if (run && run.endedAt !== undefined && run.providerSessionRef !== undefined && run.providerSessionRef !== "") {
        priorSessionRef = run.providerSessionRef;
        break;
      }
    }

    if (priorSessionRef === undefined) {
      throw new DomainError("invalid_transition", "no resumable session on prior run", { taskId });
    }

    if (task.executionStatus !== "needs-review") {
      throw new DomainError("invalid_transition",
        `continue-task requires task in needs-review, got ${task.executionStatus}`,
        { taskId, currentStatus: task.executionStatus });
    }

    const provider = providerFactory();
    const invocation = await provider.resume({ sessionRef: priorSessionRef, prompt, taskId, workflowId });
    const startSpec: { taskId: string; workflowId: string; command: string[]; env?: Record<string, string> } = {
      taskId,
      workflowId,
      command: invocation.command,
    };
    if (invocation.env !== undefined) startSpec.env = invocation.env;
    const { sessionId: runtimeSessionId, runtimeType } = await runtime.start(startSpec);

    let runningResult: CommandResult;
    try {
      runningResult = await applyCommand({
        kind: "transition-task",
        workflowId,
        transition: {
          kind: "mark-running",
          taskId,
          sessionId: runtimeSessionId,
          providerType: invocation.providerType,
          runtimeType,
          providerSessionRef: priorSessionRef,
          now: now(),
        },
      });
    } catch (err) {
      await runtime.stop(runtimeSessionId).catch(() => {});
      throw err;
    }

    const post = await repo.get(workflowId);
    const postTask = post?.graph[taskId];
    const openRun = postTask ? getOpenRun(postTask.runs) : undefined;
    if (!openRun) throw new DomainError("invalid_transition", "no open run after mark-running", { taskId });
    const runId = openRun.id;

    const orchestrator = new RunOrchestrator({
      workflowId,
      taskId,
      runId,
      runtimeSessionId,
      provider,
      runtime,
      applyCommand,
      publish: (providerEvent) => {
        const envelope: WorkflowEvent = {
          cursor: 0,
          workflowId,
          occurredAt: now(),
          kind: "provider-event",
          payload: { taskId, runId, providerEvent },
        };
        repo.publishTransient(workflowId, envelope);
      },
      now,
    });

    orchestrator.run().catch((err) => console.error("run-orchestrator error:", err));

    return runningResult;
  }
}
