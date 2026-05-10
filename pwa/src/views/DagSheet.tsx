import type { Workflow } from "../domain/types";
import { Sheet } from "../components/Sheet";
import { DagCanvas } from "./dag/DagCanvas";

interface Props {
  open: boolean;
  onClose: () => void;
  workflow: Workflow;
  activeTaskId?: string;
  onFocusTask: (taskId: string) => void;
}

export function DagSheet({ open, onClose, workflow, activeTaskId, onFocusTask }: Props): JSX.Element {
  function handleFocus(taskId: string): void {
    onFocusTask(taskId);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} side="bottom" title="Tasks">
      <DagCanvas
        workflow={workflow}
        activeTaskId={activeTaskId}
        onTaskFocus={handleFocus}
      />
    </Sheet>
  );
}
