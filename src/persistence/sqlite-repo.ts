import Database from "better-sqlite3";
import type { Statement } from "better-sqlite3";
import { DomainError } from "../domain/errors.js";
import type { WorkflowEvent } from "../domain/events.js";
import type { Workflow } from "../domain/types.js";
import type { IdempotencyRecord, WorkflowRepository } from "../application/repository.js";
import { SubscriberHub } from "./subscriber-hub.js";

const DDL = `
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  blob TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  workflow_id TEXT NOT NULL,
  cursor INTEGER NOT NULL,
  kind TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (workflow_id, cursor)
);

CREATE TABLE IF NOT EXISTS idempotency (
  workflow_id TEXT NOT NULL,
  key TEXT NOT NULL,
  result_ref TEXT NOT NULL,
  PRIMARY KEY (workflow_id, key)
);

CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
`;

interface WorkflowRow {
  blob: string;
}

interface EventRow {
  workflow_id: string;
  cursor: number;
  kind: string;
  occurred_at: string;
  payload: string;
}

interface VersionRow {
  version: number | null;
}

interface CursorRow {
  max_cursor: number | null;
}

interface IdempotencyRow {
  result_ref: string;
}

export class SQLiteWorkflowRepository implements WorkflowRepository {
  private readonly db: Database.Database;
  private readonly hub = new SubscriberHub();

  private readonly stmtGetWorkflow: Statement<[string], WorkflowRow>;
  private readonly stmtGetVersion: Statement<[string], VersionRow>;
  private readonly stmtUpsertWorkflow: Statement<[string, string, number, string]>;
  private readonly stmtMaxCursor: Statement<[string], CursorRow>;
  private readonly stmtInsertEvent: Statement<[string, number, string, string, string]>;
  private readonly stmtInsertIdempotency: Statement<[string, string, string]>;
  private readonly stmtEventsSince: Statement<[string, number], EventRow>;
  private readonly stmtLookupIdempotency: Statement<[string, string], IdempotencyRow>;
  private readonly stmtListRecoverable: Statement<[], WorkflowRow>;
  private readonly txSave: (
    workflow: Workflow,
    events: WorkflowEvent[],
    idempotency: IdempotencyRecord[],
  ) => WorkflowEvent[];

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(DDL);

    this.stmtGetWorkflow = this.db.prepare<[string], WorkflowRow>(
      "SELECT blob FROM workflows WHERE id = ?",
    );
    this.stmtGetVersion = this.db.prepare<[string], VersionRow>(
      "SELECT version FROM workflows WHERE id = ?",
    );
    this.stmtUpsertWorkflow = this.db.prepare<[string, string, number, string]>(
      "INSERT INTO workflows (id, status, version, blob) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET status = excluded.status, version = excluded.version, blob = excluded.blob",
    );
    this.stmtMaxCursor = this.db.prepare<[string], CursorRow>(
      "SELECT COALESCE(MAX(cursor), 0) AS max_cursor FROM events WHERE workflow_id = ?",
    );
    this.stmtInsertEvent = this.db.prepare<[string, number, string, string, string]>(
      "INSERT INTO events (workflow_id, cursor, kind, occurred_at, payload) VALUES (?, ?, ?, ?, ?)",
    );
    this.stmtInsertIdempotency = this.db.prepare<[string, string, string]>(
      "INSERT INTO idempotency (workflow_id, key, result_ref) VALUES (?, ?, ?)",
    );
    this.stmtEventsSince = this.db.prepare<[string, number], EventRow>(
      "SELECT workflow_id, cursor, kind, occurred_at, payload FROM events " +
      "WHERE workflow_id = ? AND cursor > ? ORDER BY cursor",
    );
    this.stmtLookupIdempotency = this.db.prepare<[string, string], IdempotencyRow>(
      "SELECT result_ref FROM idempotency WHERE workflow_id = ? AND key = ?",
    );
    this.stmtListRecoverable = this.db.prepare<[], WorkflowRow>(
      "SELECT blob FROM workflows WHERE status != 'completed'",
    );

    this.txSave = this.db.transaction(
      (workflow: Workflow, events: WorkflowEvent[], idempotency: IdempotencyRecord[]) => {
        const versionRow = this.stmtGetVersion.get(workflow.id);

        if (versionRow !== undefined && versionRow.version !== null) {
          if (versionRow.version !== workflow.version - 1) {
            throw new DomainError("version_conflict", "workflow version conflict on save", {
              workflowId: workflow.id,
              existingVersion: versionRow.version,
              incomingVersion: workflow.version,
            });
          }
        }

        this.stmtUpsertWorkflow.run(
          workflow.id,
          workflow.status,
          workflow.version,
          JSON.stringify(workflow),
        );

        const cursorRow = this.stmtMaxCursor.get(workflow.id)!;
        let nextCursor = cursorRow.max_cursor ?? 0;

        const stamped = events.map((event) => {
          nextCursor += 1;
          return { ...event, cursor: nextCursor };
        });

        for (const event of stamped) {
          this.stmtInsertEvent.run(
            event.workflowId,
            event.cursor,
            event.kind,
            event.occurredAt,
            JSON.stringify(event.payload),
          );
        }

        for (const record of idempotency) {
          try {
            this.stmtInsertIdempotency.run(workflow.id, record.key, record.resultRef);
          } catch (err) {
            if (
              err instanceof Error &&
              err.message.includes("UNIQUE constraint failed")
            ) {
              throw new DomainError("idempotency_collision", "idempotency key already exists", {
                workflowId: workflow.id,
                key: record.key,
              });
            }
            throw err;
          }
        }

        return stamped;
      },
    );
  }

  async get(workflowId: string): Promise<Workflow | undefined> {
    const row = this.stmtGetWorkflow.get(workflowId);
    if (!row) return undefined;
    return JSON.parse(row.blob) as Workflow;
  }

  async save(
    workflow: Workflow,
    events: WorkflowEvent[],
    idempotency?: IdempotencyRecord[],
  ): Promise<void> {
    const stamped = this.txSave(workflow, events, idempotency ?? []);
    this.hub.notify(workflow.id, stamped);
  }

  async eventsSince(workflowId: string, cursor: number): Promise<WorkflowEvent[]> {
    const rows = this.stmtEventsSince.all(workflowId, cursor);
    return rows.map((row) => ({
      workflowId: row.workflow_id,
      cursor: row.cursor,
      kind: row.kind as WorkflowEvent["kind"],
      occurredAt: row.occurred_at,
      payload: JSON.parse(row.payload) as WorkflowEvent["payload"],
    })) as WorkflowEvent[];
  }

  subscribe(workflowId: string, fromCursor: number): AsyncIterable<WorkflowEvent> {
    return this.hub.subscribe(workflowId, fromCursor, () =>
      this.eventsSince(workflowId, fromCursor),
    );
  }

  async lookupIdempotency(workflowId: string, key: string): Promise<string | undefined> {
    const row = this.stmtLookupIdempotency.get(workflowId, key);
    return row?.result_ref;
  }

  async listRecoverable(): Promise<Workflow[]> {
    const rows = this.stmtListRecoverable.all();
    return rows.map((row) => JSON.parse(row.blob) as Workflow);
  }

  subscriberCount(workflowId: string): number {
    return this.hub.subscriberCount(workflowId);
  }

  close(): void {
    this.db.close();
  }
}
