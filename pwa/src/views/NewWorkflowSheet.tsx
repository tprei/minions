import { useState, type ReactElement } from "react";
import type { WorkflowKind, TaskSpec } from "../domain/types";
import { createWorkflow } from "../transport/rest";
import { navigate } from "../routing/router";
import { Modal } from "../components/Modal";
import { cx } from "../util/cx";

const DRAFT_KEY = "newWorkflowDraft";

interface TaskRow {
  id: string;
  title: string;
  prompt: string;
  dependsOn: string[];
}

interface DraftState {
  displayTitle: string;
  kind: WorkflowKind;
  tasks: TaskRow[];
  autoLand: boolean;
  autoMergeOnGreen: boolean;
  maxConcurrent: number;
}

function loadDraft(): DraftState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DraftState;
  } catch {
    return null;
  }
}

function saveDraft(state: DraftState): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {
    // storage quota — silently ignore
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

function defaultState(): DraftState {
  return {
    displayTitle: "",
    kind: "single-task",
    tasks: [{ id: "t1", title: "", prompt: "", dependsOn: [] }],
    autoLand: false,
    autoMergeOnGreen: false,
    maxConcurrent: 3,
  };
}

function makeTaskId(index: number): string {
  return `t${index + 1}`;
}

export function NewWorkflowSheet(): ReactElement {
  const [open, setOpen] = useState(true);
  const [state, setState] = useState<DraftState>(() => loadDraft() ?? defaultState());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function update(patch: Partial<DraftState>): void {
    setState((prev) => {
      const next = { ...prev, ...patch };
      saveDraft(next);
      return next;
    });
  }

  function updateTask(idx: number, patch: Partial<TaskRow>): void {
    setState((prev) => {
      const tasks = prev.tasks.map((t, i) => (i === idx ? { ...t, ...patch } : t));
      const next = { ...prev, tasks };
      saveDraft(next);
      return next;
    });
  }

  function addTask(): void {
    setState((prev) => {
      const newId = makeTaskId(prev.tasks.length);
      const next = { ...prev, tasks: [...prev.tasks, { id: newId, title: "", prompt: "", dependsOn: [] }] };
      saveDraft(next);
      return next;
    });
  }

  function removeTask(idx: number): void {
    setState((prev) => {
      const removed = prev.tasks[idx]!.id;
      const tasks = prev.tasks
        .filter((_, i) => i !== idx)
        .map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => d !== removed) }));
      const next = { ...prev, tasks };
      saveDraft(next);
      return next;
    });
  }

  function toggleDep(taskIdx: number, depId: string): void {
    setState((prev) => {
      const tasks = prev.tasks.map((t, i) => {
        if (i !== taskIdx) return t;
        const has = t.dependsOn.includes(depId);
        return { ...t, dependsOn: has ? t.dependsOn.filter((d) => d !== depId) : [...t.dependsOn, depId] };
      });
      const next = { ...prev, tasks };
      saveDraft(next);
      return next;
    });
  }

  function validate(): string | null {
    if (state.tasks.length === 0) return "At least one task required.";
    for (let i = 0; i < state.tasks.length; i++) {
      const t = state.tasks[i]!;
      if (!t.title.trim()) return `Task ${i + 1}: title required.`;
      if (!t.prompt.trim()) return `Task ${i + 1}: prompt required.`;
    }
    return null;
  }

  async function handleSubmit(): Promise<void> {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const workflowId = crypto.randomUUID();
      const tasks: TaskSpec[] = state.tasks.map((t) => ({
        id: t.id,
        title: t.title.trim(),
        prompt: t.prompt.trim(),
        ...(state.kind === "manual-dag" && t.dependsOn.length > 0 ? { dependsOn: t.dependsOn } : {}),
      }));
      await createWorkflow({
        id: workflowId,
        kind: state.kind,
        tasks,
        policy: {
          autoLand: state.autoLand,
          autoMergeOnGreen: state.autoMergeOnGreen,
          maxConcurrent: state.maxConcurrent,
        },
      });
      clearDraft();
      navigate(`#/workflow/${workflowId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workflow");
      setSubmitting(false);
    }
  }

  function handleClose(): void {
    setOpen(false);
    navigate("#/");
  }

  const otherTaskIds = (currentIdx: number): string[] =>
    state.tasks.map((t, i) => (i !== currentIdx ? t.id : null)).filter(Boolean) as string[];

  return (
    <Modal open={open} onClose={handleClose} title="New workflow" className="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fg-muted font-medium">Title (display)</label>
          <input
            type="text"
            className="input text-sm"
            placeholder="What are you building?"
            value={state.displayTitle}
            onChange={(e) => update({ displayTitle: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fg-muted font-medium">Kind</label>
          <select
            className="input text-sm"
            value={state.kind}
            onChange={(e) => update({ kind: e.target.value as WorkflowKind })}
          >
            <option value="single-task">Single task</option>
            <option value="manual-dag">Multi-task (manual DAG)</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted font-medium">Tasks</span>
            {state.kind === "manual-dag" && (
              <button type="button" className="btn-secondary text-xs" onClick={addTask}>
                + Add task
              </button>
            )}
          </div>

          {state.tasks.map((task, idx) => (
            <div key={task.id} className="card p-3 flex flex-col gap-2 border border-border">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-fg-subtle bg-bg-soft px-1.5 py-0.5 rounded">
                  {task.id}
                </span>
                <input
                  type="text"
                  className="input text-xs flex-1"
                  placeholder="Task title"
                  value={task.title}
                  onChange={(e) => updateTask(idx, { title: e.target.value })}
                />
                {state.tasks.length > 1 && (
                  <button
                    type="button"
                    className="text-fg-subtle hover:text-err transition-colors text-xs px-1"
                    onClick={() => removeTask(idx)}
                    aria-label={`Remove task ${task.id}`}
                  >
                    ✕
                  </button>
                )}
              </div>

              <textarea
                className="input text-xs resize-none"
                rows={3}
                placeholder="Describe what this task should do…"
                value={task.prompt}
                onChange={(e) => updateTask(idx, { prompt: e.target.value })}
              />

              {state.kind === "manual-dag" && otherTaskIds(idx).length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-fg-subtle">Depends on</span>
                  <div className="flex flex-wrap gap-1">
                    {otherTaskIds(idx).map((depId) => {
                      const active = task.dependsOn.includes(depId);
                      return (
                        <button
                          key={depId}
                          type="button"
                          onClick={() => toggleDep(idx, depId)}
                          className={cx(
                            "text-[10px] font-mono px-2 py-0.5 rounded-full border transition-colors",
                            active
                              ? "bg-accent text-bg border-accent"
                              : "bg-transparent text-fg-subtle border-border hover:border-fg-subtle",
                          )}
                        >
                          {depId}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-fg-subtle hover:text-fg transition-colors"
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            <span>{advancedOpen ? "▼" : "▶"}</span>
            <span>Policy (advanced)</span>
          </button>

          {advancedOpen && (
            <div className="card p-3 flex flex-col gap-3 border border-border mt-1">
              <label className="flex items-center justify-between gap-2 text-xs">
                <span className="text-fg-muted">Auto-land on merge</span>
                <input
                  type="checkbox"
                  checked={state.autoLand}
                  onChange={(e) => update({ autoLand: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs">
                <span className="text-fg-muted">Auto-merge on green CI</span>
                <input
                  type="checkbox"
                  checked={state.autoMergeOnGreen}
                  onChange={(e) => update({ autoMergeOnGreen: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs">
                <span className="text-fg-muted">Max concurrent tasks</span>
                <input
                  type="number"
                  className="input text-xs w-16 text-right"
                  min={1}
                  max={10}
                  value={state.maxConcurrent}
                  onChange={(e) => update({ maxConcurrent: Number(e.target.value) })}
                />
              </label>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-err">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary text-xs" onClick={handleClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? "Creating…" : "Create workflow"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
