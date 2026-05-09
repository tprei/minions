export interface AuditFeedDeps {
  apiBase?: string;
}

export interface AuditFeed {
  element: HTMLElement;
  refresh(): Promise<void>;
}

export declare function createAuditFeed(deps?: AuditFeedDeps): AuditFeed;
