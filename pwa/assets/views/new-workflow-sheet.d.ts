export interface TaskInput {
  title: string;
  prompt: string;
  dependsOn: string[];
}

export interface PolicyInput {
  autoLand: boolean;
  autoMergeOnGreen: boolean;
  maxConcurrent: number;
}

export interface PostBody {
  id: string;
  kind: string;
  tasks: Array<{ id: string; title: string; prompt: string; dependsOn?: string[] }>;
  title?: string;
  policy?: Partial<PolicyInput>;
}

export interface BuildPostBodyOptions {
  title: string;
  prompt: string;
  kind: string;
  policy: PolicyInput;
  tasks: TaskInput[];
}

export interface NewWorkflowSheetOptions {
  onSubmit?: (workflowId: string) => void;
  onClose?: () => void;
}

export interface NewWorkflowSheetInstance {
  element: HTMLElement;
  open(): void;
  close(): void;
}

export declare function createNewWorkflowSheet(options?: NewWorkflowSheetOptions): NewWorkflowSheetInstance;
export declare function buildPostBody(options: BuildPostBodyOptions): PostBody;
