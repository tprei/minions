import type { WorkspaceBackend, WorkspaceCreateSpec, WorkspaceHandle } from "../workspace-backend.js";
import { slugify } from "../workspace-backend.js";

export class StubWorkspaceBackend implements WorkspaceBackend {
  async create(spec: WorkspaceCreateSpec): Promise<WorkspaceHandle> {
    const wfSlug = slugify(spec.workflowId);
    const taskSlug = slugify(spec.taskId);
    return {
      workspaceId: `stub-${wfSlug}_${taskSlug}`,
      mode: "existing",
      path: "/stub-workspace",
      containerPath: "/stub-workspace",
      branch: spec.branch,
    };
  }

  async cleanup(_workspaceId: string): Promise<void> {}
}
