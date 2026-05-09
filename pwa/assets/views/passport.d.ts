export interface PassportWorkflow {
  id: string;
  status?: string;
  createdAt?: string;
}

export interface PassportInstance {
  element: HTMLElement;
  refresh(): void;
  update(workflows: PassportWorkflow[]): void;
}

export declare function createPassport(options?: {
  workflows?: PassportWorkflow[];
  onRefresh?: () => PassportWorkflow[] | Promise<PassportWorkflow[]>;
}): PassportInstance;
