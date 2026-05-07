import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { applyCommand } from "../application/commands.js";
import type { Command, CommandKind } from "../application/commands.js";
import type { ContinueTaskService } from "../application/continue-task-service.js";
import type { RetryTaskService } from "../application/retry-task-service.js";
import type { RecoveryService } from "../application/recovery-service.js";
import type { WorkflowRepository } from "../application/repository.js";
import type { RestackExecutor } from "../application/restack-executor.js";
import { DomainError } from "../domain/errors.js";
import { createWorkflow } from "../domain/workflow.js";
import type { WorkflowSpec } from "../domain/types.js";
import { domainErrorToHttp } from "./errors.js";
import { validateCommand, validateWorkflowSpec } from "./validators.js";

export interface ServerDeps {
  repo: WorkflowRepository;
  recoveryService: RecoveryService;
  executor: RestackExecutor;
  continueTaskService?: ContinueTaskService;
  retryTaskService?: RetryTaskService;
}

type AcceptedCommandKind = CommandKind | "continue-task" | "retry-task";

const VALID_COMMAND_KINDS = new Set<AcceptedCommandKind>([
  "transition-task",
  "request-restack",
  "start-restack",
  "complete-restack",
  "mark-restack-conflict",
  "continue-task",
  "retry-task",
]);

export function createServer(deps: ServerDeps): Hono {
  const app = new Hono();
  const { repo } = deps;

  app.use("*", async (c, next) => {
    if (c.req.method === "OPTIONS") {
      return c.newResponse(null, 204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Last-Event-ID",
      });
    }
    await next();
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Last-Event-ID");
  });

  app.onError((err, c) => {
    if (err instanceof DomainError) {
      const mapped = domainErrorToHttp(err);
      return c.json(mapped.body, mapped.status as 400 | 404 | 409);
    }
    // Validators are the front line for client errors. Anything reaching here
    // is an unexpected server failure — surface as 500 without leaking details.
    return c.json(
      { code: "internal_error", message: "internal server error", details: {} },
      500,
    );
  });

  app.post("/workflows", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ code: "invalid_body", message: "request body is not valid JSON" }, 400);
    }

    const validation = validateWorkflowSpec(body);
    if (!validation.ok) {
      return c.json(
        {
          code: "invalid_request",
          message: validation.failure.message,
          details: { field: validation.failure.field, expected: validation.failure.expected },
        },
        400,
      );
    }

    const workflow = createWorkflow(body as WorkflowSpec);
    await repo.save(workflow, []);
    return c.json(workflow, 201);
  });

  app.get("/workflows/:id", async (c) => {
    const workflow = await repo.get(c.req.param("id"));
    if (!workflow) {
      return c.json({ code: "not_found", message: "workflow not found", details: {} }, 404);
    }
    return c.json(workflow);
  });

  app.post("/commands", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json<Record<string, unknown>>();
    } catch {
      return c.json({ code: "invalid_body", message: "request body is not valid JSON" }, 400);
    }

    const kind = body["kind"];
    if (typeof kind !== "string" || !VALID_COMMAND_KINDS.has(kind as AcceptedCommandKind)) {
      return c.json({ code: "invalid_kind", message: `unknown command kind: ${String(kind)}` }, 400);
    }

    const validation = validateCommand(body);
    if (!validation.ok) {
      return c.json(
        {
          code: "invalid_request",
          message: validation.failure.message,
          details: { field: validation.failure.field, expected: validation.failure.expected },
        },
        400,
      );
    }

    if (kind === "continue-task") {
      if (!deps.continueTaskService) {
        return c.json({ code: "internal_error", message: "continue-task service not available", details: {} }, 500);
      }
      const result = await deps.continueTaskService.run({
        workflowId: body["workflowId"] as string,
        taskId: body["taskId"] as string,
        prompt: body["prompt"] as string,
      });
      return c.json(result);
    }

    if (kind === "retry-task") {
      if (!deps.retryTaskService) {
        return c.json({ code: "internal_error", message: "retry-task service not available", details: {} }, 500);
      }
      const result = await deps.retryTaskService.run({
        workflowId: body["workflowId"] as string,
        taskId: body["taskId"] as string,
        prompt: body["prompt"] as string,
      });
      return c.json(result);
    }

    const result = await applyCommand(repo, body as unknown as Command);
    return c.json(result);
  });

  app.get("/workflows/:id/events", async (c) => {
    const workflowId = c.req.param("id");

    const workflow = await repo.get(workflowId);
    if (!workflow) {
      return c.json({ code: "not_found", message: "workflow not found", details: {} }, 404);
    }

    const sinceParam = c.req.query("since");
    let fromCursor = sinceParam !== undefined ? parseInt(sinceParam, 10) : 0;
    if (isNaN(fromCursor)) fromCursor = 0;

    const lastEventId = c.req.header("last-event-id");
    if (lastEventId !== undefined) {
      const parsed = parseInt(lastEventId, 10);
      if (!isNaN(parsed)) fromCursor = parsed;
    }

    return streamSSE(c, async (stream) => {
      const iterable = repo.subscribe(workflowId, fromCursor);
      const iterator = iterable[Symbol.asyncIterator]();

      stream.onAbort(() => {
        void iterator.return?.();
      });

      try {
        while (true) {
          const result = await iterator.next();
          if (result.done) break;
          const event = result.value;
          if (event.kind === "provider-event") {
            // omit id: so browser EventSource doesn't advance Last-Event-ID past the durable cursor
            await stream.writeSSE({ event: event.kind, data: JSON.stringify(event) });
          } else {
            await stream.writeSSE({ event: event.kind, data: JSON.stringify(event), id: String(event.cursor) });
          }
        }
      } finally {
        await iterator.return?.();
      }
    });
  });

  return app;
}
