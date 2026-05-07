import { describe, expect, it, vi } from "vitest";
import { MergeService, MergeServiceError } from "../src/application/merge-service.js";
import { InMemoryWorkflowRepository } from "../src/application/repository.js";
import { applyCommand } from "../src/application/commands.js";
import { createSingleTaskWorkflow } from "../src/domain/workflow.js";
import { transitionTask } from "../src/application/transitions.js";
import type { Command } from "../src/application/commands.js";
import type { SCMPlugin, MergeResult, MergeOutcome } from "../src/plugins/scm-plugin.js";
import type { WorkspaceBackend, WorkspaceHandle } from "../src/plugins/workspace-backend.js";
import type { WorkflowEvent } from "../src/domain/events.js";

const now = "2026-05-06T10:00:00.000Z";

function makeHandle(): WorkspaceHandle {
  return { workspaceId: "ws-1", mode: "worktree", path: "/tmp/workspace", containerPath: "/tmp/workspace", branch: "minions/test" };
}

function makeScm(overrides: Partial<SCMPlugin> = {}): SCMPlugin {
  return {
    createBranch: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue("abc123"),
    squashCommits: vi.fn().mockResolvedValue("abc123"),
    rebase: vi.fn().mockResolvedValue({ kind: "clean" } satisfies MergeResult),
    pushBranch: vi.fn().mockResolvedValue(undefined),
    openPullRequest: vi.fn().mockResolvedValue({ number: 42, url: "https://github.com/o/r/pull/42", headRef: "branch", baseRef: "main" }),
    findPullRequest: vi.fn().mockResolvedValue(null),
    getPullRequest: vi.fn().mockResolvedValue({ number: 42, url: "https://github.com/o/r/pull/42", headSha: "sha123", headRef: "branch", baseRef: "main", mergeable: true, mergeableState: "clean" }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, sha: "merged-sha" } satisfies MergeOutcome),
    ...overrides,
  };
}

function makeWorkspace(getHandle?: WorkspaceHandle): WorkspaceBackend {
  return {
    create: vi.fn().mockResolvedValue(makeHandle()),
    get: vi.fn().mockResolvedValue(getHandle),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

async function buildWorkflow(taskId: string = "wf-1:task") {
  const repo = new InMemoryWorkflowRepository();
  let workflow = createSingleTaskWorkflow("wf-1", { title: "Task 1", prompt: "Do it" }, () => now);
  // transition to finalizing
  workflow = transitionTask(workflow, { kind: "mark-ready", taskId, now });
  workflow = transitionTask(workflow, { kind: "mark-running", taskId, sessionId: "s1", now });
  workflow = transitionTask(workflow, { kind: "complete-runtime", taskId, now });
  workflow = transitionTask(workflow, { kind: "start-finalization", taskId, now });
  await repo.save(workflow, []);
  return { repo, workflow };
}

describe("MergeService", () => {
  it("happy path: 6 phases, 12 merge-phase events, task transitions to merged", async () => {
    const { repo } = await buildWorkflow();
    const scm = makeScm();
    const workspace = makeWorkspace();
    const events: WorkflowEvent[] = [];
    const origPublish = repo.publishTransient.bind(repo);
    repo.publishTransient = (wfId, event) => {
      events.push(event);
      origPublish(wfId, event);
    };

    const service = new MergeService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      scm,
      workspace,
      repoCoords: { owner: "o", repo: "r" },
      baseBranch: "main",
      now: () => now,
    });

    const result = await service.merge({ workflowId: "wf-1", taskId: "wf-1:task" });

    const mergePhaseEvents = events.filter((e) => e.kind === "merge-phase");
    expect(mergePhaseEvents).toHaveLength(12);

    const phases = mergePhaseEvents.map((e) => {
      if (e.kind !== "merge-phase") return null;
      return `${e.payload.phase}:${e.payload.status}`;
    });
    expect(phases).toEqual([
      "prepareMerge:started", "prepareMerge:completed",
      "commit:started", "commit:completed",
      "squash:started", "squash:completed",
      "rebase:started", "rebase:completed",
      "applyMerge:started", "applyMerge:completed",
      "finalize:started", "finalize:completed",
    ]);

    expect(result.workflow.graph["wf-1:task"]?.executionStatus).toBe("merged");
    expect(scm.pushBranch).toHaveBeenCalledTimes(2);
  });

  it("merge-task transition fails 3 times: throws MergeServiceError, does NOT call merge-conflict", async () => {
    const { repo } = await buildWorkflow();
    const scm = makeScm();
    const workspace = makeWorkspace();
    let mergeTaskAttempts = 0;
    const applyCommandSpy = vi.fn().mockImplementation(async (cmd: Command) => {
      if (cmd.kind === "transition-task" && "transition" in cmd && cmd.transition.kind === "merge-task") {
        mergeTaskAttempts++;
        throw new Error("simulated transition failure");
      }
      return applyCommand(repo, cmd);
    });

    const service = new MergeService({
      repo,
      applyCommand: applyCommandSpy,
      scm,
      workspace,
      repoCoords: { owner: "o", repo: "r" },
      baseBranch: "main",
      now: () => now,
    });

    await expect(service.merge({ workflowId: "wf-1", taskId: "wf-1:task" })).rejects.toBeInstanceOf(MergeServiceError);
    expect(mergeTaskAttempts).toBe(3);
    const mergeConflictCalls = applyCommandSpy.mock.calls.filter(
      (args: unknown[]) => {
        const cmd = args[0] as Command;
        return cmd.kind === "transition-task" && "transition" in cmd && cmd.transition.kind === "merge-conflict";
      },
    );
    expect(mergeConflictCalls).toHaveLength(0);
  });

  it("rebase conflict: task transitions to needs-review with patch artifact", async () => {
    const { repo } = await buildWorkflow();
    const scm = makeScm({
      rebase: vi.fn().mockResolvedValue({ kind: "conflict", conflictPaths: ["src/foo.ts"] } satisfies MergeResult),
    });
    const workspace = makeWorkspace();

    const service = new MergeService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      scm,
      workspace,
      repoCoords: { owner: "o", repo: "r" },
      baseBranch: "main",
      now: () => now,
    });

    const result = await service.merge({ workflowId: "wf-1", taskId: "wf-1:task" });

    expect(result.workflow.graph["wf-1:task"]?.executionStatus).toBe("needs-review");
    const artifacts = result.workflow.graph["wf-1:task"]?.artifacts ?? [];
    const patchArtifact = artifacts.find((a) => a.kind === "patch");
    expect(patchArtifact).toBeDefined();
    const ref = JSON.parse(patchArtifact!.ref) as { phase: string; conflictPaths: string[] };
    expect(ref.phase).toBe("rebase");
    expect(ref.conflictPaths).toEqual(["src/foo.ts"]);
  });

  it("applyMerge returns merged:false (409-style): task transitions to needs-review", async () => {
    const { repo } = await buildWorkflow();
    const scm = makeScm({
      mergePullRequest: vi.fn().mockResolvedValue({ merged: false, reason: "head_sha_changed" } satisfies MergeOutcome),
    });
    const workspace = makeWorkspace();

    const service = new MergeService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      scm,
      workspace,
      repoCoords: { owner: "o", repo: "r" },
      baseBranch: "main",
      now: () => now,
    });

    const result = await service.merge({ workflowId: "wf-1", taskId: "wf-1:task" });

    expect(result.workflow.graph["wf-1:task"]?.executionStatus).toBe("needs-review");
    const artifacts = result.workflow.graph["wf-1:task"]?.artifacts ?? [];
    const patchArtifact = artifacts.find((a) => a.kind === "patch");
    expect(patchArtifact).toBeDefined();
    const ref = JSON.parse(patchArtifact!.ref) as { phase: string };
    expect(ref.phase).toBe("applyMerge");
  });

  it("rejects when task is in wrong status", async () => {
    const repo = new InMemoryWorkflowRepository();
    let workflow = createSingleTaskWorkflow("wf-1", { title: "Task 1", prompt: "Do it" }, () => now);
    await repo.save(workflow, []);

    const service = new MergeService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      scm: makeScm(),
      workspace: makeWorkspace(),
      repoCoords: { owner: "o", repo: "r" },
      baseBranch: "main",
      now: () => now,
    });

    // task is in "pending" — should not be mergeable
    await expect(service.merge({ workflowId: "wf-1", taskId: "wf-1:task" })).rejects.toBeDefined();
  });

  it("GitHub 500 in phase 5 propagates to caller, NOT merge-conflict; workspace cleaned up", async () => {
    const { repo } = await buildWorkflow();
    const githubError = Object.assign(new Error("GitHub API error"), { status: 500 });
    const scm = makeScm({
      mergePullRequest: vi.fn().mockRejectedValue(githubError),
    });
    const workspace = makeWorkspace();

    const service = new MergeService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      scm,
      workspace,
      repoCoords: { owner: "o", repo: "r" },
      baseBranch: "main",
      now: () => now,
    });

    await expect(service.merge({ workflowId: "wf-1", taskId: "wf-1:task" })).rejects.toBe(githubError);
    expect(workspace.cleanup).toHaveBeenCalledOnce();
  });

  it("getPR returns mergeable:null once then true: poll succeeds, merge proceeds", async () => {
    const { repo } = await buildWorkflow();
    let getPRCallCount = 0;
    const scm = makeScm({
      getPullRequest: vi.fn().mockImplementation(async () => {
        getPRCallCount++;
        if (getPRCallCount === 1) {
          return { number: 42, url: "https://github.com/o/r/pull/42", headSha: "sha123", headRef: "branch", baseRef: "main", mergeable: null, mergeableState: null };
        }
        return { number: 42, url: "https://github.com/o/r/pull/42", headSha: "sha123", headRef: "branch", baseRef: "main", mergeable: true, mergeableState: "clean" };
      }),
    });
    const workspace = makeWorkspace();

    const service = new MergeService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      scm,
      workspace,
      repoCoords: { owner: "o", repo: "r" },
      baseBranch: "main",
      now: () => now,
    });

    const result = await service.merge({ workflowId: "wf-1", taskId: "wf-1:task" });
    expect(result.workflow.graph["wf-1:task"]?.executionStatus).toBe("merged");
    expect(getPRCallCount).toBe(2);
  });

  it("getPR returns mergeable:null for 5 attempts: MergeConflictError → merge-conflict transition", async () => {
    const { repo } = await buildWorkflow();
    const scm = makeScm({
      getPullRequest: vi.fn().mockResolvedValue({
        number: 42, url: "https://github.com/o/r/pull/42", headSha: "sha123", headRef: "branch", baseRef: "main",
        mergeable: null, mergeableState: null,
      }),
    });
    const workspace = makeWorkspace();

    const service = new MergeService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      scm,
      workspace,
      repoCoords: { owner: "o", repo: "r" },
      baseBranch: "main",
      now: () => now,
    });

    const result = await service.merge({ workflowId: "wf-1", taskId: "wf-1:task" });
    expect(result.workflow.graph["wf-1:task"]?.executionStatus).toBe("needs-review");
    const artifacts = result.workflow.graph["wf-1:task"]?.artifacts ?? [];
    const patchArtifact = artifacts.find((a) => a.kind === "patch");
    expect(patchArtifact).toBeDefined();
    const ref = JSON.parse(patchArtifact!.ref) as { phase: string; reason: string };
    expect(ref.phase).toBe("applyMerge");
    expect(scm.getPullRequest).toHaveBeenCalledTimes(5);
  }, 10000);

  it("any phase failure → workspace.cleanup called once", async () => {
    const { repo } = await buildWorkflow();
    const pushError = new Error("push failed");
    const scm = makeScm({
      pushBranch: vi.fn().mockRejectedValue(pushError),
    });
    const workspace = makeWorkspace();

    const service = new MergeService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      scm,
      workspace,
      repoCoords: { owner: "o", repo: "r" },
      baseBranch: "main",
      now: () => now,
    });

    await expect(service.merge({ workflowId: "wf-1", taskId: "wf-1:task" })).rejects.toBe(pushError);
    expect(workspace.cleanup).toHaveBeenCalledOnce();
    expect(workspace.cleanup).toHaveBeenCalledWith("ws-1");
  });

  it("failed phase is correctly identified in the artifact ref", async () => {
    const { repo } = await buildWorkflow();
    const scm = makeScm({
      rebase: vi.fn().mockResolvedValue({ kind: "conflict", conflictPaths: ["a.ts"] } satisfies MergeResult),
    });
    const workspace = makeWorkspace();

    const service = new MergeService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      scm,
      workspace,
      repoCoords: { owner: "o", repo: "r" },
      baseBranch: "main",
      now: () => now,
    });

    const result = await service.merge({ workflowId: "wf-1", taskId: "wf-1:task" });
    const artifacts = result.workflow.graph["wf-1:task"]?.artifacts ?? [];
    const patchArtifact = artifacts.find((a) => a.kind === "patch");
    const ref = JSON.parse(patchArtifact!.ref) as { phase: string };
    expect(ref.phase).toBe("rebase");
  });

  it("workspace.get returns handle — merge proceeds without calling create()", async () => {
    const { repo } = await buildWorkflow();
    const scm = makeScm();
    const handle = makeHandle();
    const workspace = makeWorkspace(handle);

    const service = new MergeService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      scm,
      workspace,
      repoCoords: { owner: "o", repo: "r" },
      baseBranch: "main",
      now: () => now,
    });

    const result = await service.merge({ workflowId: "wf-1", taskId: "wf-1:task" });
    expect(result.workflow.graph["wf-1:task"]?.executionStatus).toBe("merged");
    expect(workspace.get).toHaveBeenCalledOnce();
    expect(workspace.create).not.toHaveBeenCalled();
  });

  it("workspace.get returns undefined — falls back to create()", async () => {
    const { repo } = await buildWorkflow();
    const scm = makeScm();
    const workspace = makeWorkspace(undefined);

    const service = new MergeService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      scm,
      workspace,
      repoCoords: { owner: "o", repo: "r" },
      baseBranch: "main",
      now: () => now,
    });

    const result = await service.merge({ workflowId: "wf-1", taskId: "wf-1:task" });
    expect(result.workflow.graph["wf-1:task"]?.executionStatus).toBe("merged");
    expect(workspace.get).toHaveBeenCalledOnce();
    expect(workspace.create).toHaveBeenCalledOnce();
  });

  it("workspace not yet created when prepareMerge fails: cleanup not called", async () => {
    const repo = new InMemoryWorkflowRepository();
    const workflow = createSingleTaskWorkflow("wf-1", { title: "Task 1", prompt: "Do it" }, () => now);
    await repo.save(workflow, []);

    const workspace = makeWorkspace();

    const service = new MergeService({
      repo,
      applyCommand: (cmd) => applyCommand(repo, cmd),
      scm: makeScm(),
      workspace,
      repoCoords: { owner: "o", repo: "r" },
      baseBranch: "main",
      now: () => now,
    });

    await expect(service.merge({ workflowId: "wf-1", taskId: "wf-1:task" })).rejects.toBeDefined();
    expect(workspace.cleanup).not.toHaveBeenCalled();
  });
});
