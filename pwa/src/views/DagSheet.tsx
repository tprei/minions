import type { Workflow } from "../domain/types";
import { Sheet } from "../components/Sheet";
import { StatusDot } from "../components/StatusDot";

interface Props {
  open: boolean;
  onClose: () => void;
  workflow: Workflow;
  activeTaskId?: string;
  onFocusTask: (taskId: string) => void;
}

export function DagSheet({ open, onClose, workflow, activeTaskId, onFocusTask }: Props): JSX.Element {
  const tasks = Object.values(workflow.graph).sort(
    (a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt),
  );

  return (
    <Sheet open={open} onClose={onClose} side="bottom" title="Tasks">
      <div className="space-y-2">
        {tasks.map((task) => (
          <div key={task.id}>
            {task.dependsOn.length > 0 && (
              <div className="text-[10px] text-fg-subtle ml-5 mb-0.5">
                {task.dependsOn.join(", ")} → {task.id}
              </div>
            )}
            <button
              type="button"
              className="w-full flex items-center gap-2 text-left p-2 rounded hover:bg-bg-elev transition-colors"
              onClick={() => { onFocusTask(task.id); onClose(); }}
            >
              <StatusDot status={task.executionStatus} size="sm" />
              <span className={`text-xs truncate ${activeTaskId === task.id ? "text-fg font-medium" : "text-fg-muted"}`}>
                {task.title || task.id}
              </span>
              <span className="text-[10px] text-fg-subtle ml-auto">{task.executionStatus}</span>
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
