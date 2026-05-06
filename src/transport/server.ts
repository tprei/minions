import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { applyCommand } from "../application/commands.js";
import type { Command, CommandKind } from "../application/commands.js";
import type { RecoveryService } from "../application/recovery-service.js";
import type { WorkflowRepository } from "../application/repository.js";
import type { RestackExecutor } from "../application/restack-executor.js";
import { DomainError } from "../domain/errors.js";
import { createWorkflow } from "../domain/workflow.js";
import type { WorkflowSpec } from "../domain/types.js";
import { domainErrorToHttp } from "./errors.js";

export interface ServerDeps {
  repo: WorkflowRepository;
  recoveryService: RecoveryService;
  executor: RestackExecutor;
}

const VALID_COMMAND_KINDS = new Set<CommandKind>([
  "transition-task",
  "request-restack",
  "start-restack",
  "complete-restack",
  "mark-restack-conflict",
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

  app.post("/workflows", async (c) => {
    let spec: WorkflowSpec;
    try {
      spec = await c.req.json<WorkflowSpec>();
    } catch {
      return c.json({ code: "invalid_body", message: "request body is not valid JSON" }, 400);
    }

    try {
      const workflow = createWorkflow(spec);
      await repo.save(workflow, []);
      return c.json(workflow, 201);
    } catch (err) {
      if (err instanceof DomainError) {
        const mapped = domainErrorToHttp(err);
        return c.json(mapped.body, mapped.status as 400 | 404 | 409);
      }
      throw err;
    }
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
    if (typeof kind !== "string" || !VALID_COMMAND_KINDS.has(kind as CommandKind)) {
      return c.json({ code: "invalid_kind", message: `unknown command kind: ${String(kind)}` }, 400);
    }

    try {
      const result = await applyCommand(repo, body as unknown as Command);
      return c.json(result);
    } catch (err) {
      if (err instanceof DomainError) {
        const mapped = domainErrorToHttp(err);
        return c.json(mapped.body, mapped.status as 400 | 404 | 409);
      }
      throw err;
    }
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
          await stream.writeSSE({
            event: event.kind,
            data: JSON.stringify(event),
            id: String(event.cursor),
          });
        }
      } finally {
        await iterator.return?.();
      }
    });
  });

  return app;
}
