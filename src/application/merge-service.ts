import { DomainError } from "../domain/errors.js";
import type { WorkflowEvent, MergePhase } from "../domain/events.js";
import type { Artifact } from "../domain/types.js";
import type { SCMPlugin } from "../plugins/scm-plugin.js";
import type { WorkspaceBackend } from "../plugins/workspace-backend.js";
import { slugify } from "../plugins/workspace-backend.js";
import type { Command, CommandResult } from "./commands.js";
import type { WorkflowRepository } from "./repository.js";

export interface MergeServiceDeps {
  repo: WorkflowRepository;
  applyCommand: (cmd: Command) => Promise<CommandResult>;
  scm: SCMPlugin;
  workspace: WorkspaceBackend;
  repoCoords: { owner: string; repo: string };
  baseBranch: string;
  now: () => string;
}

export interface MergeInput {
  workflowId: string;
  taskId: string;
}

function deriveBranch(workflowId: string, taskId: string): string {
  return `minions/${slugify(workflowId)}_${slugify(taskId)}`;
}

export class MergeService {
  private readonly deps: MergeServiceDeps;

  constructor(deps: MergeServiceDeps) {
    this.deps = deps;
  }

  async merge(input: MergeInput): Promise<CommandResult> {
    const { workflowId, taskId } = input;
    const { repo, applyCommand, scm, workspace, repoCoords, baseBranch, now } = this.deps;

    const emitPhase = (phase: MergePhase, status: "started" | "completed", error?: string): void => {
      const event: WorkflowEvent = {
        cursor: 0,
        workflowId,
        occurredAt: now(),
        kind: "merge-phase",
        payload: { taskId, phase, status, ...(error !== undefined ? { error } : {}) },
      };
      repo.publishTransient(workflowId, event);
    };

    const buildConflictArtifact = (phase: MergePhase, reason: string, conflictPaths?: string[]): Artifact => ({
      kind: "patch",
      ref: JSON.stringify({ phase, reason, ...(conflictPaths !== undefined ? { conflictPaths } : {}) }),
      producedBy: "merge-service",
      createdAt: now(),
    });

    let workspaceHandle: Awaited<ReturnType<WorkspaceBackend["create"]>> | undefined;
    let branch: string | undefined;

    try {
      // Phase 1: prepareMerge
      emitPhase("prepareMerge", "started");
      const workflow = await repo.get(workflowId);
      if (!workflow) {
        throw new DomainError("not_found", "workflow not found", { workflowId });
      }
      const task = workflow.graph[taskId];
      if (!task) {
        throw new DomainError("not_found", "task not found", { taskId });
      }
      if (task.executionStatus !== "finalizing" && task.executionStatus !== "pr-open") {
        throw new DomainError(
          "invalid_transition",
          `merge requires task in finalizing or pr-open, got ${task.executionStatus}`,
          { taskId, executionStatus: task.executionStatus },
        );
      }
      branch = deriveBranch(workflowId, taskId);
      workspaceHandle = await workspace.create({
        workflowId,
        taskId,
        branch,
        mode: "worktree",
        resetBranch: false,
      });
      emitPhase("prepareMerge", "completed");

      // Phase 2: commit (push branch)
      emitPhase("commit", "started");
      await scm.pushBranch(workspaceHandle.path, branch);
      emitPhase("commit", "completed");

      // Phase 3: squash (no-op for v1)
      emitPhase("squash", "started");
      emitPhase("squash", "completed");

      // Phase 4: rebase
      emitPhase("rebase", "started");
      const rebaseResult = await scm.rebase(workspaceHandle.path, baseBranch);
      if (rebaseResult.kind === "conflict") {
        const err = new Error(`rebase conflict in ${rebaseResult.conflictPaths.join(", ")}`);
        (err as Error & { conflictPaths: string[] }).conflictPaths = rebaseResult.conflictPaths;
        throw err;
      }
      emitPhase("rebase", "completed");

      // Phase 5: applyMerge
      emitPhase("applyMerge", "started");
      let prRef = await scm.findPullRequest({ owner: repoCoords.owner, repo: repoCoords.repo, head: branch, base: baseBranch });

      if (prRef === null) {
        const wf = await repo.get(workflowId);
        const t = wf?.graph[taskId];
        const prTitle = t?.title ?? `Task ${taskId}`;
        prRef = await scm.openPullRequest({
          owner: repoCoords.owner,
          repo: repoCoords.repo,
          title: prTitle,
          body: `Created by minions task ${taskId} (workflow ${workflowId}).`,
          head: branch,
          base: baseBranch,
        });
        await applyCommand({
          kind: "transition-task",
          workflowId,
          transition: {
            kind: "open-review",
            taskId,
            artifacts: [{ kind: "pr", ref: prRef.url, producedBy: "merge-service", createdAt: now() }],
            now: now(),
          },
        });
      }

      const prDetail = await scm.getPullRequest({ owner: repoCoords.owner, repo: repoCoords.repo, number: prRef.number });

      if (prDetail.mergeableState !== null && prDetail.mergeableState !== "clean" && prDetail.mergeableState !== "unstable") {
        throw Object.assign(
          new Error(`PR not mergeable: mergeable_state=${prDetail.mergeableState}`),
          { blockedState: prDetail.mergeableState },
        );
      }

      const outcome = await scm.mergePullRequest({
        owner: repoCoords.owner,
        repo: repoCoords.repo,
        number: prRef.number,
        expectedHeadSha: prDetail.headSha,
        method: "squash",
      });

      if (!outcome.merged) {
        throw Object.assign(
          new Error(`PR merge failed: reason=${outcome.reason}`),
          { mergeReason: outcome.reason },
        );
      }
      emitPhase("applyMerge", "completed");

      // Phase 6: finalize
      emitPhase("finalize", "started");
      const finalResult = await applyCommand({
        kind: "transition-task",
        workflowId,
        transition: {
          kind: "merge-task",
          taskId,
          now: now(),
        },
      });
      await workspace.cleanup(workspaceHandle.workspaceId).catch(() => {});
      emitPhase("finalize", "completed");

      return finalResult;
    } catch (err) {
      const phase = resolveFailedPhase(err, workspaceHandle);
      const reason = err instanceof Error ? err.message : String(err);
      const conflictPaths = (err as { conflictPaths?: string[] }).conflictPaths;
      const artifact = buildConflictArtifact(phase, reason, conflictPaths);

      const currentWf = await repo.get(workflowId).catch(() => undefined);
      const currentTask = currentWf?.graph[taskId];
      const fromStatus = currentTask?.executionStatus;
      if (fromStatus === "finalizing" || fromStatus === "pr-open") {
        const conflictResult = await applyCommand({
          kind: "transition-task",
          workflowId,
          transition: {
            kind: "merge-conflict",
            taskId,
            artifacts: [artifact],
            reason,
            now: now(),
          },
        });
        return conflictResult;
      }

      throw err;
    }
  }
}

function resolveFailedPhase(
  _err: unknown,
  handle: Awaited<ReturnType<WorkspaceBackend["create"]>> | undefined,
): MergePhase {
  if (handle === undefined) return "prepareMerge";
  const err = _err as { conflictPaths?: string[]; blockedState?: string; mergeReason?: string };
  if (err.conflictPaths !== undefined) return "rebase";
  if (err.blockedState !== undefined || err.mergeReason !== undefined) return "applyMerge";
  return "finalize";
}
