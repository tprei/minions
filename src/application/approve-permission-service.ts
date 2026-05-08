import { DomainError } from "../domain/errors.js";
import type { ProviderPlugin } from "../plugins/provider-plugin.js";
import type { WorkflowRepository } from "./repository.js";

export interface ApprovePermissionServiceDeps {
  repo: WorkflowRepository;
  activeProviders: Map<string, Map<string, ProviderPlugin>>;
}

export interface ApprovePermissionInput {
  workflowId: string;
  taskId: string;
  requestId: string;
  decision: "approve" | "deny";
  reason?: string;
}

export interface ApprovePermissionResult {
  ok: true;
}

export class ApprovePermissionService {
  private readonly deps: ApprovePermissionServiceDeps;

  constructor(deps: ApprovePermissionServiceDeps) {
    this.deps = deps;
  }

  async run(input: ApprovePermissionInput): Promise<ApprovePermissionResult> {
    const { workflowId, taskId, requestId, decision, reason } = input;
    const { repo, activeProviders } = this.deps;

    const workflow = await repo.get(workflowId);
    if (!workflow) {
      throw new DomainError("not_found", "workflow not found", { workflowId });
    }

    const task = workflow.graph[taskId];
    if (!task) {
      throw new DomainError("not_found", "task not found", { taskId });
    }

    if (task.executionStatus !== "running") {
      throw new DomainError(
        "invalid_transition",
        `approve-permission requires task in running state, got ${task.executionStatus}`,
        { taskId, currentStatus: task.executionStatus },
      );
    }

    const provider = activeProviders.get(workflowId)?.get(taskId);
    if (!provider) {
      throw new DomainError(
        "not_found",
        "no active provider session for task",
        { workflowId, taskId },
      );
    }

    if (typeof provider.injectApproval !== "function") {
      throw new DomainError(
        "invalid_transition",
        `provider "${provider.name}" does not support approval injection`,
        { providerName: provider.name },
      );
    }

    await provider.injectApproval(requestId, decision, reason);

    return { ok: true };
  }
}
