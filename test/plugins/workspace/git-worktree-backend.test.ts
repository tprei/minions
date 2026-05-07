import { describe, expect, it, vi, beforeEach } from "vitest";
import { GitWorktreeWorkspaceBackend } from "../../../src/plugins/workspace/git-worktree-backend.js";
import { WorkspaceError } from "../../../src/plugins/workspace-backend.js";
import type { GitClient } from "../../../src/plugins/git/git-client.js";

vi.mock("node:fs/promises", () => ({
  realpath: vi.fn(async (p: unknown) => String(p)),
  mkdir: vi.fn(async () => undefined),
  rm: vi.fn(async () => undefined),
}));

const FAKE_REPO = "/fake/repo";
const FAKE_ROOT = "/fake/workspaces";

function makeGitClient(): GitClient {
  return {
    run: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
    worktreeAdd: vi.fn().mockResolvedValue(undefined),
    worktreeRemove: vi.fn().mockResolvedValue(undefined),
    worktreePrune: vi.fn().mockResolvedValue(undefined),
    worktreeList: vi.fn().mockResolvedValue([]),
    revParse: vi.fn().mockResolvedValue("abc123"),
    branchExists: vi.fn().mockResolvedValue(false),
  } as unknown as GitClient;
}

async function makeBackend(
  gitClient: GitClient,
  opts?: { containerWorkspaceRoot?: string },
): Promise<GitWorktreeWorkspaceBackend> {
  const config: Parameters<typeof GitWorktreeWorkspaceBackend.create>[0] = {
    gitClient,
    repoPath: FAKE_REPO,
    workspaceRoot: FAKE_ROOT,
  };
  if (opts?.containerWorkspaceRoot !== undefined) {
    config.containerWorkspaceRoot = opts.containerWorkspaceRoot;
  }
  return GitWorktreeWorkspaceBackend.create(config);
}

beforeEach(async () => {
  vi.clearAllMocks();
  const fsp = vi.mocked(await import("node:fs/promises"));
  fsp.realpath.mockImplementation(async (p) => String(p));
  fsp.mkdir.mockResolvedValue(undefined);
  fsp.rm.mockResolvedValue(undefined);
});

describe("GitWorktreeWorkspaceBackend", () => {
  describe("create — worktree mode", () => {
    it("calls gitClient.worktreeAdd with correct path and branch", async () => {
      const gitClient = makeGitClient();
      const backend = await makeBackend(gitClient);

      const handle = await backend.create({
        workflowId: "wf1",
        taskId: "task1",
        branch: "minions/wf1_task1",
        mode: "worktree",
      });

      expect(gitClient.worktreeAdd).toHaveBeenCalledOnce();
      expect(gitClient.worktreeAdd).toHaveBeenCalledWith(
        FAKE_REPO,
        expect.objectContaining({ path: "/fake/workspaces/wf1_task1", branch: "minions/wf1_task1" }),
      );
      expect(handle.workspaceId).toBe("ws-wf1_task1");
      expect(handle.path).toBe("/fake/workspaces/wf1_task1");
      expect(handle.mode).toBe("worktree");
    });
  });

  describe("create — existing mode", () => {
    it("returns passthrough handle with repoPath, no git ops", async () => {
      const gitClient = makeGitClient();
      const backend = await makeBackend(gitClient);

      const handle = await backend.create({
        workflowId: "wf1",
        taskId: "task1",
        branch: "main",
        mode: "existing",
      });

      expect(gitClient.worktreeAdd).not.toHaveBeenCalled();
      expect(handle.mode).toBe("existing");
      expect(handle.path).toBe(FAKE_REPO);
      expect(handle.workspaceId).toBe("existing-wf1_task1");
    });
  });

  describe("mutex serialization", () => {
    it("two concurrent creates against the same repo execute sequentially", async () => {
      const order: number[] = [];
      let release!: () => void;
      const barrier = new Promise<void>((r) => { release = r; });

      const gitClient = makeGitClient();
      let callCount = 0;
      (gitClient.worktreeAdd as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        const n = ++callCount;
        if (n === 1) {
          order.push(1);
          await barrier;
        } else {
          order.push(2);
        }
      });

      const backend = await makeBackend(gitClient);

      const p1 = backend.create({ workflowId: "wf-a", taskId: "task-a", branch: "b-a", mode: "worktree" });
      const p2 = backend.create({ workflowId: "wf-b", taskId: "task-b", branch: "b-b", mode: "worktree" });

      // Let p1 start
      await new Promise((r) => setImmediate(r));
      // Release p1
      release();
      await Promise.all([p1, p2]);

      // p1 must start before p2 since they share the same repoPath lock
      expect(order).toEqual([1, 2]);
    });

    it("different repos run in parallel (no cross-repo blocking)", async () => {
      const calls: string[] = [];
      let resolveFirst!: () => void;
      const firstBarrier = new Promise<void>((r) => { resolveFirst = r; });

      const gitClientA = makeGitClient();
      const gitClientB = makeGitClient();

      (gitClientA.worktreeAdd as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        calls.push("A-start");
        await firstBarrier;
        calls.push("A-end");
      });
      (gitClientB.worktreeAdd as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        calls.push("B");
      });

      const backendA = await GitWorktreeWorkspaceBackend.create({
        gitClient: gitClientA,
        repoPath: "/repo-a",
        workspaceRoot: FAKE_ROOT,
      });
      const backendB = await GitWorktreeWorkspaceBackend.create({
        gitClient: gitClientB,
        repoPath: "/repo-b",
        workspaceRoot: FAKE_ROOT,
      });

      const pA = backendA.create({ workflowId: "wf-a", taskId: "t-a", branch: "b-a", mode: "worktree" });
      const pB = backendB.create({ workflowId: "wf-b", taskId: "t-b", branch: "b-b", mode: "worktree" });

      await new Promise((r) => setImmediate(r));
      // B should have started while A is still held
      expect(calls).toContain("A-start");
      expect(calls).toContain("B");
      resolveFirst();
      await Promise.all([pA, pB]);
    });
  });

  describe("path validation", () => {
    it("rejects workflowId that produces empty slug (e.g. '..')", async () => {
      const gitClient = makeGitClient();
      const backend = await makeBackend(gitClient);

      await expect(
        backend.create({ workflowId: "..", taskId: "task1", branch: "b", mode: "worktree" }),
      ).rejects.toThrow(WorkspaceError);
    });

    it("rejects taskId that produces empty slug (e.g. special chars only)", async () => {
      const gitClient = makeGitClient();
      const backend = await makeBackend(gitClient);

      await expect(
        backend.create({ workflowId: "wf1", taskId: "..", branch: "b", mode: "worktree" }),
      ).rejects.toThrow(WorkspaceError);
    });

    it("accepts valid alphanumeric ids", async () => {
      const gitClient = makeGitClient();
      const backend = await makeBackend(gitClient);

      await expect(
        backend.create({ workflowId: "wf-1", taskId: "task_1", branch: "b", mode: "worktree" }),
      ).resolves.toBeDefined();
    });
  });

  describe("cleanup", () => {
    it("cleanup of unknown id is a no-op", async () => {
      const gitClient = makeGitClient();
      const backend = await makeBackend(gitClient);

      await expect(backend.cleanup("nonexistent-id")).resolves.toBeUndefined();
      expect(gitClient.worktreeRemove).not.toHaveBeenCalled();
    });

    it("cleanup of existing mode just removes from handles, no git ops", async () => {
      const gitClient = makeGitClient();
      const backend = await makeBackend(gitClient);

      const handle = await backend.create({ workflowId: "wf1", taskId: "task1", branch: "b", mode: "existing" });
      await backend.cleanup(handle.workspaceId);

      expect(gitClient.worktreeRemove).not.toHaveBeenCalled();

      // Second cleanup is idempotent
      await expect(backend.cleanup(handle.workspaceId)).resolves.toBeUndefined();
    });

    it("second cleanup of same worktree id is a no-op", async () => {
      const gitClient = makeGitClient();
      const backend = await makeBackend(gitClient);

      const handle = await backend.create({ workflowId: "wf1", taskId: "task1", branch: "b", mode: "worktree" });
      await backend.cleanup(handle.workspaceId);
      await backend.cleanup(handle.workspaceId);

      expect(gitClient.worktreeRemove).toHaveBeenCalledOnce();
    });

    it("swallows not_found error from worktreeRemove", async () => {
      const gitClient = makeGitClient();
      const { GitError } = await import("../../../src/plugins/git/git-client.js");
      (gitClient.worktreeRemove as ReturnType<typeof vi.fn>).mockRejectedValue(
        new GitError("failed", "", "is not a working tree", 128),
      );

      const backend = await makeBackend(gitClient);
      const handle = await backend.create({ workflowId: "wf1", taskId: "task1", branch: "b", mode: "worktree" });

      await expect(backend.cleanup(handle.workspaceId)).resolves.toBeUndefined();
    });
  });

  describe("containerPath translation", () => {
    it("returns hostPath unchanged when containerWorkspaceRoot equals workspaceRoot", async () => {
      const gitClient = makeGitClient();
      const backend = await makeBackend(gitClient);

      const handle = await backend.create({ workflowId: "wf1", taskId: "task1", branch: "b", mode: "worktree" });

      expect(handle.containerPath).toBe(handle.path);
    });

    it("applies suffix substitution when containerWorkspaceRoot differs", async () => {
      const gitClient = makeGitClient();
      const backend = await makeBackend(gitClient, { containerWorkspaceRoot: "/container/workspaces" });

      const handle = await backend.create({ workflowId: "wf1", taskId: "task1", branch: "b", mode: "worktree" });

      // host path: /fake/workspaces/wf1_task1
      // container: /container/workspaces/wf1_task1
      expect(handle.containerPath).toBe("/container/workspaces/wf1_task1");
      expect(handle.path).toBe("/fake/workspaces/wf1_task1");
    });
  });
});
