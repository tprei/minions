import { useEffect, useRef, useState } from "react";
import { listWorkflows, postCommand } from "../transport/rest";
import { RestError } from "../transport/rest";
import { useWorkflowStore, useWorkflows } from "../store/useWorkflowStore";
import { navigate } from "../routing/router";
import type { WorkflowSummary } from "../domain/types";
import { useLongPress } from "../hooks/useLongPress";
import { ContextMenu, type ContextMenuItem } from "../components/ContextMenu";

const POLL_INTERVAL_MS = 2000;
const PINNED_KEY = "pinnedWorkflows";

function loadPinned(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function savePinned(ids: string[]): void {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota
  }
}

interface MenuState {
  workflowId: string;
  x: number;
  y: number;
}

interface WorkflowRowProps {
  workflow: WorkflowSummary;
  pinned: boolean;
  onLongPress: (id: string, x: number, y: number) => void;
  onClick: (id: string) => void;
}

function WorkflowRow({ workflow, pinned, onLongPress, onClick }: WorkflowRowProps): JSX.Element {
  const { bind } = useLongPress({
    onLongPress: (x, y) => onLongPress(workflow.id, x, y),
  });

  return (
    <button
      type="button"
      className="w-full flex gap-3 p-3 border border-border rounded text-sm font-mono hover:bg-bg-elev transition-colors text-left"
      onClick={() => onClick(workflow.id)}
      {...bind}
    >
      {pinned && <span className="text-accent" title="Pinned">📌</span>}
      <span className="opacity-60 truncate flex-1">{workflow.firstTaskTitle ?? workflow.id.slice(0, 8)}</span>
      <span>{workflow.status}</span>
    </button>
  );
}

export function WorkflowList(): JSX.Element {
  const setSummaries = useWorkflowStore((s) => s.setSummaries);
  const summaries = useWorkflows();
  const [error, setError] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string[]>(loadPinned);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function fetch(): Promise<void> {
      try {
        const list = await listWorkflows();
        if (!mountedRef.current) return;
        setError(null);
        setSummaries(list);
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        setError(err instanceof RestError ? `HTTP ${err.status}` : "Failed to load workflows");
      }
    }

    void fetch();
    const timer = setInterval(() => { void fetch(); }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [setSummaries]);

  function togglePin(id: string): void {
    setPinned((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      savePinned(next);
      return next;
    });
  }

  function buildMenuItems(workflowId: string): ContextMenuItem[] {
    const cached = useWorkflowStore.getState().workflows.get(workflowId);
    const isPinned = pinned.includes(workflowId);

    const failedTask = cached
      ? Object.values(cached.graph).find((t) => t.executionStatus === "failed")
      : undefined;

    const tasksWithPr = cached
      ? Object.values(cached.graph).flatMap((t) =>
          t.artifacts.filter((a) => a.kind === "pr").map((a) => a.ref),
        )
      : [];
    const prUrl = tasksWithPr[0];

    const items: ContextMenuItem[] = [
      {
        id: "pin",
        label: isPinned ? "Unpin" : "Pin",
        onSelect: () => togglePin(workflowId),
      },
      {
        id: "retry",
        label: failedTask ? "Retry failed task" : "Retry",
        disabled: !failedTask,
        onSelect: () => {
          if (!failedTask) return;
          void postCommand({
            kind: "retry-task",
            workflowId,
            taskId: failedTask.id,
            prompt: failedTask.prompt,
          });
        },
      },
      {
        id: "jump-to-pr",
        label: prUrl ? "Jump to PR" : "Jump to PR (no PR yet)",
        disabled: !prUrl,
        onSelect: () => {
          if (prUrl) window.open(prUrl, "_blank");
        },
      },
    ];
    return items;
  }

  if (summaries === undefined && error === null) {
    return <p className="text-sm opacity-60">Loading workflows…</p>;
  }

  if (error !== null) {
    return <p className="text-sm text-red-500">{error}</p>;
  }

  if (summaries === undefined || summaries.length === 0) {
    return <p className="text-sm opacity-60">No active workflows.</p>;
  }

  const sorted = [...summaries].sort((a, b) => {
    const ap = pinned.includes(a.id) ? 0 : 1;
    const bp = pinned.includes(b.id) ? 0 : 1;
    return ap - bp;
  });

  return (
    <>
      <ul className="space-y-2">
        {sorted.map((w) => (
          <li key={w.id}>
            <WorkflowRow
              workflow={w}
              pinned={pinned.includes(w.id)}
              onLongPress={(id, x, y) => setMenu({ workflowId: id, x, y })}
              onClick={(id) => navigate(`/workflow/${id}`)}
            />
          </li>
        ))}
      </ul>
      {menu !== null && (
        <ContextMenu
          open
          x={menu.x}
          y={menu.y}
          items={buildMenuItems(menu.workflowId)}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}
