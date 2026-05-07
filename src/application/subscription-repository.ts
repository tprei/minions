export interface PushSubscriptionRecord {
  endpoint: string;
  workflowId: string;
  keys: { p256dh: string; auth: string };
}

export interface SubscriptionRepository {
  upsert(record: PushSubscriptionRecord): Promise<void>;
  remove(endpoint: string): Promise<void>;
  listByWorkflow(workflowId: string): Promise<PushSubscriptionRecord[]>;
}

export class InMemorySubscriptionRepository implements SubscriptionRepository {
  private readonly store = new Map<string, PushSubscriptionRecord>();

  async upsert(record: PushSubscriptionRecord): Promise<void> {
    this.store.set(record.endpoint, record);
  }

  async remove(endpoint: string): Promise<void> {
    this.store.delete(endpoint);
  }

  async listByWorkflow(workflowId: string): Promise<PushSubscriptionRecord[]> {
    const result: PushSubscriptionRecord[] = [];
    for (const record of this.store.values()) {
      if (record.workflowId === workflowId) {
        result.push(record);
      }
    }
    return result;
  }
}
