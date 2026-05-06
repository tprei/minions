// The repository assigns cursors to events at save time. applyCommand produces
// events with cursor: 0 as a placeholder; save overwrites with real values.
import { DomainError } from "../domain/errors.js";
import type { WorkflowEvent } from "../domain/events.js";
import type { Workflow } from "../domain/types.js";

export interface WorkflowRepository {
  get(workflowId: string): Promise<Workflow | undefined>;
  save(workflow: Workflow, events: WorkflowEvent[]): Promise<void>;
  eventsSince(workflowId: string, cursor: number): Promise<WorkflowEvent[]>;
  subscribe(workflowId: string, fromCursor: number): AsyncIterable<WorkflowEvent>;
  recordIdempotency(workflowId: string, key: string, resultRef: string): Promise<void>;
  lookupIdempotency(workflowId: string, key: string): Promise<string | undefined>;
}

interface Subscriber {
  buffer: WorkflowEvent[];
  resolve: (() => void) | undefined;
  aborted: boolean;
  abort: () => void;
}

export class InMemoryWorkflowRepository implements WorkflowRepository {
  private readonly workflows = new Map<string, Workflow>();
  private readonly events = new Map<string, WorkflowEvent[]>();
  private readonly idempotency = new Map<string, Map<string, string>>();
  readonly subscribers = new Map<string, Set<Subscriber>>();

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

    const subs = this.subscribers.get(workflow.id);
    if (subs && stamped.length > 0) {
      for (const sub of Array.from(subs)) {
        for (const event of stamped) {
          sub.buffer.push(event);
        }
        if (sub.resolve) {
          const resolve = sub.resolve;
          sub.resolve = undefined;
          resolve();
        }
      }
    }
  }

  async eventsSince(workflowId: string, cursor: number): Promise<WorkflowEvent[]> {
    const workflowEvents = this.events.get(workflowId) ?? [];
    return workflowEvents.filter((e) => e.cursor > cursor);
  }

  subscribe(workflowId: string, fromCursor: number): AsyncIterable<WorkflowEvent> {
    const repo = this;
    return {
      [Symbol.asyncIterator]() {
        const sub: Subscriber = {
          buffer: [],
          resolve: undefined,
          aborted: false,
          abort() {
            this.aborted = true;
            if (this.resolve) {
              const r = this.resolve;
              this.resolve = undefined;
              r();
            }
          },
        };

        let subSet = repo.subscribers.get(workflowId);
        if (!subSet) {
          subSet = new Set();
          repo.subscribers.set(workflowId, subSet);
        }
        subSet.add(sub);

        async function* gen(): AsyncGenerator<WorkflowEvent> {
          try {
            // Replay persisted events, tracking what we've yielded
            let lastYielded = fromCursor;
            const replay = await repo.eventsSince(workflowId, fromCursor);
            for (const event of replay) {
              if (sub.aborted) return;
              yield event;
              lastYielded = event.cursor;
            }

            // Live loop: drain buffer, then await new events
            while (!sub.aborted) {
              while (sub.buffer.length > 0) {
                const event = sub.buffer.shift()!;
                if (event.cursor <= lastYielded) continue;
                if (sub.aborted) return;
                yield event;
                lastYielded = event.cursor;
              }
              if (sub.aborted) return;
              await new Promise<void>((r) => {
                sub.resolve = r;
              });
            }
          } finally {
            const set = repo.subscribers.get(workflowId);
            if (set) {
              set.delete(sub);
              if (set.size === 0) repo.subscribers.delete(workflowId);
            }
          }
        }

        const generator = gen();

        function cleanup() {
          const set = repo.subscribers.get(workflowId);
          if (set) {
            set.delete(sub);
            if (set.size === 0) repo.subscribers.delete(workflowId);
          }
        }

        // Wrap return() to abort the subscriber and unblock the pending promise
        const originalReturn = generator.return.bind(generator);
        return {
          next: generator.next.bind(generator),
          return(value?: unknown) {
            sub.abort();
            cleanup();
            return originalReturn(value as WorkflowEvent);
          },
          throw: generator.throw.bind(generator),
          [Symbol.asyncIterator]() { return this; },
        };
      },
    };
  }

  subscriberCount(workflowId: string): number {
    return this.subscribers.get(workflowId)?.size ?? 0;
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
