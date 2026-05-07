import { DomainError } from "../domain/errors.js";
import type { ProviderPlugin } from "../plugins/provider-plugin.js";
import type { RuntimeBackend } from "../plugins/runtime-backend.js";
import type { Command, CommandResult } from "./commands.js";
import type { WorkflowRepository } from "./repository.js";
import { RunOrchestrator } from "./run-orchestrator.js";

export interface ContinueTaskServiceDeps {
  repo: WorkflowRepository;
  applyCommand: (cmd: Command) => Promise<CommandResult>;
  provider: ProviderPlugin;
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
    const { repo, applyCommand, provider, runtime, now } = this.deps;

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

    const invocation = await provider.resume({ sessionRef: priorSessionRef, prompt, taskId, workflowId });
    const startSpec: { taskId: string; workflowId: string; command: string[]; env?: Record<string, string> } = {
      taskId,
      workflowId,
      command: invocation.command,
    };
    if (invocation.env !== undefined) startSpec.env = invocation.env;
    const { sessionId: runtimeSessionId, runtimeType } = await runtime.start(startSpec);

    await applyCommand({
      kind: "transition-task",
      workflowId,
      transition: { kind: "mark-ready", taskId, now: now() },
    });

    const runningResult = await applyCommand({
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

    const orchestrator = new RunOrchestrator({
      workflowId,
      taskId,
      runtimeSessionId,
      provider,
      runtime,
      applyCommand,
      now,
    });

    orchestrator.run().catch((err) => console.error("run-orchestrator error:", err));

    return runningResult;
  }
}
