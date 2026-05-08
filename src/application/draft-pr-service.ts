import { DomainError } from "../domain/errors.js";
import type { ProviderPlugin } from "../plugins/provider-plugin.js";
import type { RuntimeBackend } from "../plugins/runtime-backend.js";
import { runProvider } from "../plugins/providers/run-provider.js";
import type { WorkspaceBackend } from "../plugins/workspace-backend.js";
import { slugify } from "../plugins/workspace-backend.js";
import type { WorkflowRepository } from "./repository.js";

export class DraftPrError extends Error {
  readonly code: "parse_error" | "timeout";

  constructor(code: "parse_error" | "timeout", message: string) {
    super(message);
    this.name = "DraftPrError";
    this.code = code;
  }
}

export interface DraftPrServiceDeps {
  repo: WorkflowRepository;
  providerFactory: () => ProviderPlugin;
  runtime: RuntimeBackend;
  workspace: WorkspaceBackend;
}

const DRAFT_PR_PROMPT =
  'Generate a PR title and body for this task\'s diff. Reply with a single JSON object: {"title": string, "body": string}. Do not wrap in markdown.';

const TIMEOUT_MS = 30_000;

function deriveBranch(workflowId: string, taskId: string): string {
  return `minions/${slugify(workflowId)}_${slugify(taskId)}`;
}

export async function draftPr({
  workflowId,
  taskId,
  deps,
}: {
  workflowId: string;
  taskId: string;
  deps: DraftPrServiceDeps;
}): Promise<{ title: string; body: string }> {
  const { repo, providerFactory, runtime, workspace } = deps;

  const workflow = await repo.get(workflowId);
  if (!workflow) {
    throw new DomainError("not_found", "workflow not found", { workflowId });
  }

  const task = workflow.graph[taskId];
  if (!task) {
    throw new DomainError("not_found", "task not found", { taskId });
  }

  const branchArtifact = task.artifacts.find((a) => a.kind === "branch");
  if (!branchArtifact) {
    throw new DomainError("invalid_transition", "task has no branch artifact", { taskId });
  }

  const handle = await workspace.create({
    workflowId,
    taskId,
    branch: deriveBranch(workflowId, taskId),
    mode: "worktree",
    resetBranch: false,
  });

  const provider = providerFactory();
  const invocation = await provider.prepare({
    taskId,
    workflowId,
    prompt: DRAFT_PR_PROMPT,
    dependencyArtifacts: [],
  });

  const startResult = await runtime.start({
    taskId,
    workflowId,
    command: invocation.command,
    workspacePath: handle.containerPath,
    ...(invocation.env !== undefined ? { env: invocation.env } : {}),
  });

  const runtimeSessionId = startResult.sessionId;

  try {
    return await runWithTimeout(
      (signal) => collectProviderOutput(runtime, runtimeSessionId, provider, signal),
      TIMEOUT_MS,
    );
  } finally {
    await runtime.stop(runtimeSessionId).catch(() => {});
    await workspace.cleanup(handle.workspaceId).catch(() => {});
  }
}

async function runWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const abort = new AbortController();

  return new Promise<T>((resolve, reject) => {
    const handle = setTimeout(() => {
      abort.abort();
      reject(new DraftPrError("timeout", "draft-pr timed out after 30s"));
    }, ms);

    fn(abort.signal).then(
      (value) => {
        clearTimeout(handle);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(handle);
        reject(err);
      },
    );
  });
}

async function collectProviderOutput(
  runtime: RuntimeBackend,
  runtimeSessionId: string,
  provider: ProviderPlugin,
  signal: AbortSignal,
): Promise<{ title: string; body: string }> {
  const textParts: string[] = [];

  for await (const item of runProvider(runtime, runtimeSessionId, provider, { signal })) {
    if (item.kind !== "provider") continue;

    if (item.event.kind === "assistant_text") {
      textParts.push(item.event.text);
      continue;
    }

    if (item.event.kind === "final") {
      const raw = textParts.join("").trim();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new DraftPrError("parse_error", `provider response is not valid JSON: ${raw}`);
      }
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        typeof (parsed as Record<string, unknown>)["title"] !== "string" ||
        typeof (parsed as Record<string, unknown>)["body"] !== "string"
      ) {
        throw new DraftPrError(
          "parse_error",
          `provider response missing title or body fields: ${raw}`,
        );
      }
      const obj = parsed as Record<string, unknown>;
      return { title: obj["title"] as string, body: obj["body"] as string };
    }
  }

  if (signal.aborted) {
    throw new DraftPrError("timeout", "draft-pr timed out after 30s");
  }

  throw new DraftPrError("parse_error", "provider ended without emitting a final event");
}
