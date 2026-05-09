export interface ApprovalRenderContext {
  workflowId?: string;
  taskId?: string;
  onResolved?: (requestId: string) => void;
}

export declare function render(event: Record<string, unknown>, ctx?: ApprovalRenderContext): HTMLElement;
