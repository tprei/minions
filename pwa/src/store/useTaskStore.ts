import { useWorkflowStore } from "./useWorkflowStore";
import type { TaskExecutionStatus, TaskNode } from "../domain/types";

export function selectTasksByWorkflow(workflowId: string): TaskNode[] {
  const wf = useWorkflowStore.getState().workflows.get(workflowId);
  return wf ? Object.values(wf.graph) : [];
}

export function selectTasksByExecutionStatus(
  workflowId: string,
  status: TaskExecutionStatus,
): TaskNode[] {
  return selectTasksByWorkflow(workflowId).filter((t) => t.executionStatus === status);
}

export function useTasksByWorkflow(workflowId: string): TaskNode[] {
  return useWorkflowStore((s) => {
    const wf = s.workflows.get(workflowId);
    return wf ? Object.values(wf.graph) : [];
  });
}

export function useTasksByExecutionStatus(
  workflowId: string,
  status: TaskExecutionStatus,
): TaskNode[] {
  return useWorkflowStore((s) => {
    const wf = s.workflows.get(workflowId);
    if (!wf) return [];
    return Object.values(wf.graph).filter((t) => t.executionStatus === status);
  });
}
