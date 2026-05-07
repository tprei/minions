import { EventEmitter } from "node:events";
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitClient, GitError } from "../../../src/plugins/git/git-client.js";

vi.mock("node:child_process");

interface MockProc extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
}

function makeMockProc(stdoutData: string, stderrData: string, exitCode: number): MockProc {
  const proc = new EventEmitter() as MockProc;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();

  setImmediate(() => {
    proc.stdout.emit("data", Buffer.from(stdoutData));
    proc.stderr.emit("data", Buffer.from(stderrData));
    proc.emit("close", exitCode);
  });

  return proc;
}

let spawnMock: Mock;

beforeEach(async () => {
  const cp = await import("node:child_process");
  spawnMock = cp.spawn as unknown as Mock;
  spawnMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GitClient", () => {
  describe("worktreeAdd", () => {
    it("builds correct argv without baseRef", async () => {
      const client = new GitClient();
      spawnMock.mockReturnValue(makeMockProc("", "", 0));

      await client.worktreeAdd("/repo", { path: "/workspace/wf_task", branch: "minions/wf_task" });

      expect(spawnMock).toHaveBeenCalledWith(
        "git",
        ["worktree", "add", "-B", "minions/wf_task", "/workspace/wf_task", "HEAD"],
        { cwd: "/repo" },
      );
    });

    it("builds correct argv with baseRef", async () => {
      const client = new GitClient();
      spawnMock.mockReturnValue(makeMockProc("", "", 0));

      await client.worktreeAdd("/repo", {
        path: "/workspace/wf_task",
        branch: "minions/wf_task",
        baseRef: "main",
      });

      expect(spawnMock).toHaveBeenCalledWith(
        "git",
        ["worktree", "add", "-B", "minions/wf_task", "/workspace/wf_task", "main"],
        { cwd: "/repo" },
      );
    });
  });

  describe("commandPrefix", () => {
    it("prepends commandPrefix before git and its args", async () => {
      const client = new GitClient({ commandPrefix: ["docker", "exec", "worker"] });
      spawnMock.mockReturnValue(makeMockProc("", "", 0));

      await client.worktreePrune("/repo");

      expect(spawnMock).toHaveBeenCalledWith(
        "docker",
        ["exec", "worker", "git", "worktree", "prune"],
        { cwd: "/repo" },
      );
    });
  });

  describe("worktreeList", () => {
    it("parses --porcelain k/v output into entries", async () => {
      const client = new GitClient();
      const porcelainOutput = [
        "worktree /repo",
        "HEAD abc123",
        "branch refs/heads/main",
        "",
        "worktree /workspace/wf_task",
        "HEAD def456",
        "branch refs/heads/minions/wf_task",
        "",
      ].join("\n");

      spawnMock.mockReturnValue(makeMockProc(porcelainOutput, "", 0));

      const result = await client.worktreeList("/repo");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ path: "/repo", head: "abc123", branch: "refs/heads/main" });
      expect(result[1]).toEqual({
        path: "/workspace/wf_task",
        head: "def456",
        branch: "refs/heads/minions/wf_task",
      });
    });

    it("handles detached HEAD (no branch line)", async () => {
      const client = new GitClient();
      const porcelainOutput = [
        "worktree /workspace/detached",
        "HEAD abc123",
        "detached",
        "",
      ].join("\n");

      spawnMock.mockReturnValue(makeMockProc(porcelainOutput, "", 0));

      const result = await client.worktreeList("/repo");

      expect(result).toHaveLength(1);
      expect(result[0]!.branch).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("spawn non-zero exit surfaces as GitError", async () => {
      const client = new GitClient();
      spawnMock.mockReturnValue(makeMockProc("", "fatal: not a git repository", 128));

      await expect(client.revParse("/not-a-repo", "HEAD")).rejects.toThrow(GitError);
    });

    it("GitError carries stdout, stderr, exitCode", async () => {
      const client = new GitClient();
      spawnMock.mockReturnValue(makeMockProc("out", "err", 1));

      let caught: unknown;
      try {
        await client.worktreePrune("/repo");
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(GitError);
      const err = caught as GitError;
      expect(err.stdout).toBe("out");
      expect(err.stderr).toBe("err");
      expect(err.exitCode).toBe(1);
    });
  });
});
