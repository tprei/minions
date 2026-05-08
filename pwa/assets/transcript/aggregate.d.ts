export declare const CLUSTER_MIN: number;

export declare class ClusterGroup {
  kind: string;
  toolName: string | undefined;
  events: unknown[];
  expanded: boolean;
  _id: string | undefined;
  constructor(kind: string, toolName: string | undefined);
  get length(): number;
  push(event: unknown): void;
}

export declare function aggregateConsecutive(
  events: unknown[],
  kindsToCluster: Set<string>,
  previousGroups: unknown[] | null | undefined,
): Array<unknown | ClusterGroup>;
