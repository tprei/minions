import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type {
  Workflow,
  WorkflowEvent,
  WorkflowSummary,
} from "../domain/types";

interface WorkflowState {
  workflows: Map<string, Workflow>;
  summaries: WorkflowSummary[] | undefined;
  setSummaries: (list: WorkflowSummary[]) => void;
  setWorkflow: (w: Workflow) => void;
  applyEvent: (evt: WorkflowEvent) => void;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  workflows: new Map(),
  summaries: undefined,

  setSummaries(list) {
    set({ summaries: list });
  },

  setWorkflow(w) {
    set((s) => {
      const next = new Map(s.workflows);
      next.set(w.id, w);
      return { workflows: next };
    });
  },

  applyEvent(evt) {
    set((s) => {
      const wf = s.workflows.get(evt.workflowId);
      if (!wf) return s;

      let updated: Workflow;

      switch (evt.kind) {
        case "workflow-status-changed": {
          updated = { ...wf, status: evt.payload.toStatus };
          break;
        }
        case "task-transitioned": {
          const { taskId, toExecutionStatus, toStackStatus, taskVersion } = evt.payload;
          const task = wf.graph[taskId];
          if (!task) return s;
          updated = {
            ...wf,
            graph: {
              ...wf.graph,
              [taskId]: {
                ...task,
                executionStatus: toExecutionStatus,
                stackStatus: toStackStatus,
                version: taskVersion,
              },
            },
          };
          break;
        }
        case "graph-operation-changed": {
          const { operationId, toStatus } = evt.payload;
          const op = wf.operations[operationId];
          if (!op) return s;
          updated = {
            ...wf,
            operations: {
              ...wf.operations,
              [operationId]: { ...op, status: toStatus },
            },
          };
          break;
        }
        case "run-started": {
          const { taskId, runId, attempt, runtimeSessionId, providerSessionRef, providerType, runtimeType } = evt.payload;
          const task = wf.graph[taskId];
          if (!task) return s;
          const newRun = {
            id: runId,
            taskId,
            attempt,
            providerType,
            runtimeType,
            runtimeSessionId,
            ...(providerSessionRef !== undefined ? { providerSessionRef } : {}),
            startedAt: evt.occurredAt,
          };
          updated = {
            ...wf,
            graph: {
              ...wf.graph,
              [taskId]: { ...task, runs: [...task.runs, newRun] },
            },
          };
          break;
        }
        case "run-ended": {
          const { taskId, runId, terminalReason } = evt.payload;
          const task = wf.graph[taskId];
          if (!task) return s;
          const runs = task.runs.map((r) =>
            r.id === runId ? { ...r, endedAt: evt.occurredAt, terminalReason } : r,
          );
          updated = {
            ...wf,
            graph: { ...wf.graph, [taskId]: { ...task, runs } },
          };
          break;
        }
        case "provider-event":
        case "merge-phase":
          return s;
      }

      const next = new Map(s.workflows);
      next.set(evt.workflowId, updated);
      return { workflows: next };
    });
  },
}));

export function selectWorkflowById(id: string): Workflow | undefined {
  return useWorkflowStore.getState().workflows.get(id);
}

export function selectAllSummaries(): WorkflowSummary[] | undefined {
  return useWorkflowStore.getState().summaries;
}

export function useWorkflows(): WorkflowSummary[] | undefined {
  return useWorkflowStore((s) => s.summaries);
}

export function useWorkflowById(id: string): Workflow | undefined {
  return useWorkflowStore(
    useShallow((s) => s.workflows.get(id)),
  );
}
