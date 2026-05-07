import { join, sep, dirname, basename } from "node:path";
import { realpath, mkdir } from "node:fs/promises";
import * as fsp from "node:fs/promises";
import type { GitClient } from "../git/git-client.js";
import { GitError } from "../git/git-client.js";
import type { WorkspaceBackend, WorkspaceCreateSpec, WorkspaceHandle } from "../workspace-backend.js";
import { WorkspaceError, slugify } from "../workspace-backend.js";

export interface GitWorktreeBackendConfig {
  gitClient: GitClient;
  repoPath: string;
  workspaceRoot: string;
  containerWorkspaceRoot?: string;
}

function isNotFoundError(err: unknown): boolean {
  if (err instanceof GitError) {
    const msg = err.stderr + err.stdout;
    return (
      msg.includes("is not a working tree") ||
      msg.includes("does not exist") ||
      msg.includes("not a working tree")
    );
  }
  return false;
}

export class GitWorktreeWorkspaceBackend implements WorkspaceBackend {
  private static readonly locks: Map<string, Promise<void>> = new Map();

  private readonly gitClient: GitClient;
  private readonly workspaceRoot: string;
  private readonly containerWorkspaceRoot: string;
  private readonly handles: Map<string, WorkspaceHandle> = new Map();

  private repoPath: string;

  private constructor(
    gitClient: GitClient,
    repoPath: string,
    workspaceRoot: string,
    containerWorkspaceRoot: string,
  ) {
    this.gitClient = gitClient;
    this.repoPath = repoPath;
    this.workspaceRoot = workspaceRoot;
    this.containerWorkspaceRoot = containerWorkspaceRoot;
  }

  static async create(config: GitWorktreeBackendConfig): Promise<GitWorktreeWorkspaceBackend> {
    const repoPath = await realpath(config.repoPath);
    let workspaceRoot: string;
    try {
      workspaceRoot = await realpath(config.workspaceRoot);
    } catch {
      await mkdir(config.workspaceRoot, { recursive: true });
      workspaceRoot = await realpath(config.workspaceRoot);
    }
    const containerWorkspaceRoot = config.containerWorkspaceRoot ?? workspaceRoot;
    return new GitWorktreeWorkspaceBackend(config.gitClient, repoPath, workspaceRoot, containerWorkspaceRoot);
  }

  private toContainerPath(hostPath: string): string {
    if (this.containerWorkspaceRoot === this.workspaceRoot) return hostPath;
    return this.containerWorkspaceRoot + hostPath.slice(this.workspaceRoot.length);
  }

  private async validateContainment(candidate: string): Promise<void> {
    const parentResolved = await realpath(dirname(candidate)).catch(() => null);
    if (parentResolved === null) {
      throw new WorkspaceError("path_escape", `parent directory does not exist: ${dirname(candidate)}`);
    }
    const resolved = parentResolved + sep + basename(candidate);

    if (resolved !== this.workspaceRoot && !resolved.startsWith(this.workspaceRoot + sep)) {
      throw new WorkspaceError("path_escape", `candidate path escapes workspace root`, {
        candidate,
        workspaceRoot: this.workspaceRoot,
      });
    }

    const relative = resolved.slice(this.workspaceRoot.length + 1);
    if (relative.includes(sep)) {
      throw new WorkspaceError("path_escape", `workspace path must be exactly one level deep`, {
        candidate,
      });
    }
  }

  private withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const locks = GitWorktreeWorkspaceBackend.locks;
    const prev = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    locks.set(key, prev.then(() => gate));
    return prev.then(async () => {
      try {
        return await fn();
      } finally {
        release();
      }
    });
  }

  async create(spec: WorkspaceCreateSpec): Promise<WorkspaceHandle> {
    const mode = spec.mode ?? "worktree";
    const wfSlug = slugify(spec.workflowId);
    const taskSlug = slugify(spec.taskId);

    if (!wfSlug || !taskSlug) {
      throw new WorkspaceError("path_escape", "workflowId and taskId must produce non-empty slugs", {
        workflowId: spec.workflowId,
        taskId: spec.taskId,
      });
    }

    if (mode === "existing") {
      const workspaceId = `existing-${wfSlug}_${taskSlug}`;
      const handle: WorkspaceHandle = {
        workspaceId,
        mode: "existing",
        path: this.repoPath,
        containerPath: this.repoPath,
        branch: spec.branch,
      };
      this.handles.set(workspaceId, handle);
      return handle;
    }

    const worktreePath = join(this.workspaceRoot, `${wfSlug}_${taskSlug}`);
    await this.validateContainment(worktreePath);

    const workspaceId = `ws-${wfSlug}_${taskSlug}`;

    return this.withLock(this.repoPath, async () => {
      const addOpts: { path: string; branch: string; baseRef?: string } = {
        path: worktreePath,
        branch: spec.branch,
      };
      if (spec.baseRef !== undefined) addOpts.baseRef = spec.baseRef;
      await this.gitClient.worktreeAdd(this.repoPath, addOpts);

      const handle: WorkspaceHandle = {
        workspaceId,
        mode: "worktree",
        path: worktreePath,
        containerPath: this.toContainerPath(worktreePath),
        branch: spec.branch,
      };
      this.handles.set(workspaceId, handle);
      return handle;
    });
  }

  async cleanup(workspaceId: string): Promise<void> {
    const handle = this.handles.get(workspaceId);
    if (!handle) return;

    if (handle.mode === "existing") {
      this.handles.delete(workspaceId);
      return;
    }

    await this.withLock(this.repoPath, async () => {
      try {
        await this.gitClient.worktreeRemove(this.repoPath, handle.path, { force: true });
      } catch (err) {
        if (!isNotFoundError(err)) throw err;
      }

      try {
        await this.gitClient.worktreePrune(this.repoPath);
      } catch {
        // prune failure is non-fatal; reclaimable via future sweep
      }

      try {
        await fsp.rm(handle.path, { recursive: true, force: true });
      } catch {
        // non-fatal; directory may already be gone
      }
    });

    this.handles.delete(workspaceId);
  }
}
