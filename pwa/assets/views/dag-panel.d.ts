import type { Workflow } from "../../../src/domain/types.js";
export declare function createDagPanel(opts: {
  workflow: Workflow;
  onTaskFocus: (taskId: string) => void;
}): {
  open: (container?: HTMLElement) => void;
  update: (workflow: Workflow) => void;
  destroy: () => void;
};
