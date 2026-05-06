export type MergeResult =
  | { kind: "clean" }
  | { kind: "conflict"; conflictPaths: string[] };

export interface SCMPlugin {
  createBranch(workspaceId: string, branchName: string): Promise<void>;
  commit(workspaceId: string, message: string): Promise<string>;
  merge(workspaceId: string, sourceBranch: string, targetBranch: string): Promise<MergeResult>;
  rebase(workspaceId: string, onto: string): Promise<MergeResult>;
}
