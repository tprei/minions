import { DomainError } from "../domain/errors.js";
import type { WorkflowEvent, MergePhase } from "../domain/events.js";
import type { Artifact } from "../domain/types.js";
import type { SCMPlugin } from "../plugins/scm-plugin.js";
import type { WorkspaceBackend } from "../plugins/workspace-backend.js";
import { slugify } from "../plugins/workspace-backend.js";
import type { Command, CommandResult } from "./commands.js";
import type { WorkflowRepository } from "./repository.js";

export class MergeServiceError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, details: Record<string, unknown>) {
    super(code);
    this.name = "MergeServiceError";
    this.code = code;
    this.details = details;
  }
}

export class MergeConflictError extends Error {
  readonly conflictCode: string;
  readonly conflictPaths: string[] | undefined;

  constructor(conflictCode: string, message: string, conflictPaths?: string[]) {
    super(message);
    this.name = "MergeConflictError";
    this.conflictCode = conflictCode;
    this.conflictPaths = conflictPaths;
  }
}

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

async function getPRWithMergeable(
  scm: SCMPlugin,
  owner: string,
  repo: string,
  number: number,
): Promise<Awaited<ReturnType<SCMPlugin["getPullRequest"]>>> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const pr = await scm.getPullRequest({ owner, repo, number });
    if (pr.mergeable !== null) return pr;
    await new Promise<void>((r) => setTimeout(r, 1000));
  }
  throw new MergeConflictError("mergeable_unknown", "GitHub did not compute mergeability after 5 attempts");
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
    let currentPhase: MergePhase = "prepareMerge";
    let branch: string | undefined;
    let mergedSha: string | undefined;

    try {
      // Phase 1: prepareMerge
      currentPhase = "prepareMerge";
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
      const workspaceId = `ws-${slugify(workflowId)}_${slugify(taskId)}`;
      workspaceHandle = await workspace.get(workspaceId);
      if (!workspaceHandle) {
        workspaceHandle = await workspace.create({ workflowId, taskId, branch, mode: "worktree", resetBranch: false });
      }
      emitPhase("prepareMerge", "completed");

      // Phase 2: commit (push branch)
      currentPhase = "commit";
      emitPhase("commit", "started");
      await scm.pushBranch(workspaceHandle.path, branch);
      emitPhase("commit", "completed");

      // Phase 3: squash (no-op for v1)
      currentPhase = "squash";
      emitPhase("squash", "started");
      emitPhase("squash", "completed");

      // Phase 4: rebase
      currentPhase = "rebase";
      emitPhase("rebase", "started");
      const rebaseResult = await scm.rebase(workspaceHandle.path, baseBranch);
      if (rebaseResult.kind === "conflict") {
        throw new MergeConflictError(
          "rebase_conflict",
          `rebase conflict in ${rebaseResult.conflictPaths.join(", ")}`,
          rebaseResult.conflictPaths,
        );
      }
      // Push after rebase so the remote head matches the rebased SHA before GitHub merges.
      await scm.pushBranch(workspaceHandle.path, branch);
      emitPhase("rebase", "completed");

      // Phase 5: applyMerge
      currentPhase = "applyMerge";
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

      const prDetail = await getPRWithMergeable(scm, repoCoords.owner, repoCoords.repo, prRef.number);

      if (prDetail.mergeableState !== null && prDetail.mergeableState !== "clean" && prDetail.mergeableState !== "unstable") {
        throw new MergeConflictError(
          "not_mergeable",
          `PR not mergeable: mergeable_state=${prDetail.mergeableState}`,
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
        throw new MergeConflictError(
          outcome.reason,
          `PR merge failed: reason=${outcome.reason}`,
        );
      }
      mergedSha = outcome.sha;
      emitPhase("applyMerge", "completed");

      // Phase 6: finalize
      currentPhase = "finalize";
      emitPhase("finalize", "started");
      const maxAttempts = 3;
      let finalResult: CommandResult | undefined;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          finalResult = await applyCommand({
            kind: "transition-task",
            workflowId,
            transition: { kind: "merge-task", taskId, now: now() },
          });
          break;
        } catch (err) {
          if (attempt + 1 >= maxAttempts) {
            // GitHub is already merged but internal state won't transition — operator must reconcile.
            console.error(
              `MERGE INCONSISTENCY: github merged sha=${mergedSha} but internal merge-task transition failed after ${maxAttempts} attempts. Operator must reconcile. Workflow=${workflowId} Task=${taskId}`,
              err,
            );
            throw new MergeServiceError("merge_state_inconsistent", {
              sha: mergedSha,
              workflowId,
              taskId,
              cause: err,
            });
          }
          await new Promise<void>((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
        }
      }
      emitPhase("finalize", "completed");

      return finalResult!;
    } catch (err) {
      if (err instanceof MergeServiceError) {
        emitPhase("finalize", "completed", "MERGE_INCONSISTENT");
        throw err;
      }

      if (err instanceof MergeConflictError) {
        const artifact = buildConflictArtifact(currentPhase, err.message, err.conflictPaths);

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
              reason: err.message,
              now: now(),
            },
          });
          return conflictResult;
        }
      }

      throw err;
    } finally {
      if (workspaceHandle !== undefined) {
        await workspace.cleanup(workspaceHandle.workspaceId).catch((err) => {
          console.error(`workspace cleanup failed for ${workspaceHandle!.workspaceId}:`, err);
        });
      }
    }
  }
}
