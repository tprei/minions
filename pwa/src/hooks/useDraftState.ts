import { useState, useEffect, useRef } from "react";

const DEBOUNCE_MS = 250;

function storageKey(workflowId: string, taskId: string): string {
  return `draft:${workflowId}:${taskId}`;
}

export function useDraftState(
  workflowId: string,
  taskId: string,
): [string, (value: string) => void, () => void] {
  const key = storageKey(workflowId, taskId);
  const [draft, setDraftState] = useState<string>(() => {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key) ?? "";
      setDraftState(stored);
    } catch {
      setDraftState("");
    }
  }, [key]);

  function setDraft(value: string): void {
    setDraftState(value);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(keyRef.current, value);
      } catch {
        // storage quota exceeded — silently ignore
      }
    }, DEBOUNCE_MS);
  }

  function clearDraft(): void {
    setDraftState("");
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    try {
      localStorage.removeItem(keyRef.current);
    } catch {
      // ignore
    }
  }

  return [draft, setDraft, clearDraft];
}
