// The repository assigns cursors to events at save time. applyCommand produces
// events with cursor: 0 as a placeholder; save overwrites with real values.
import { DomainError } from "../domain/errors.js";
import type { WorkflowEvent } from "../domain/events.js";
import type { Workflow } from "../domain/types.js";

export interface WorkflowRepository {
  get(workflowId: string): Promise<Workflow | undefined>;
  save(workflow: Workflow, events: WorkflowEvent[]): Promise<void>;
  eventsSince(workflowId: string, cursor: number): Promise<WorkflowEvent[]>;
  recordIdempotency(workflowId: string, key: string, resultRef: string): Promise<void>;
  lookupIdempotency(workflowId: string, key: string): Promise<string | undefined>;
}

export class InMemoryWorkflowRepository implements WorkflowRepository {
  private readonly workflows = new Map<string, Workflow>();
  private readonly events = new Map<string, WorkflowEvent[]>();
  private readonly idempotency = new Map<string, Map<string, string>>();

  async get(workflowId: string): Promise<Workflow | undefined> {
    return this.workflows.get(workflowId);
  }

  async save(workflow: Workflow, events: WorkflowEvent[]): Promise<void> {
    const existing = this.workflows.get(workflow.id);

    if (existing !== undefined) {
      if (existing.version !== workflow.version - 1) {
        throw new DomainError("version_conflict", "workflow version conflict on save", {
          workflowId: workflow.id,
          existingVersion: existing.version,
          incomingVersion: workflow.version,
        });
      }
    }

    const workflowEvents = this.events.get(workflow.id) ?? [];
    const nextCursor = workflowEvents.length > 0
      ? (workflowEvents[workflowEvents.length - 1]?.cursor ?? 0)
      : 0;

    const stamped = events.map((event, i) => ({ ...event, cursor: nextCursor + i + 1 }));

    this.workflows.set(workflow.id, workflow);
    this.events.set(workflow.id, [...workflowEvents, ...stamped]);
  }

  async eventsSince(workflowId: string, cursor: number): Promise<WorkflowEvent[]> {
    const workflowEvents = this.events.get(workflowId) ?? [];
    return workflowEvents.filter((e) => e.cursor > cursor);
  }

  async recordIdempotency(workflowId: string, key: string, resultRef: string): Promise<void> {
    let keyMap = this.idempotency.get(workflowId);
    if (!keyMap) {
      keyMap = new Map();
      this.idempotency.set(workflowId, keyMap);
    }
    keyMap.set(key, resultRef);
  }

  async lookupIdempotency(workflowId: string, key: string): Promise<string | undefined> {
    return this.idempotency.get(workflowId)?.get(key);
  }
}
