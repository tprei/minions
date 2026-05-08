function storageKey(workflowId, taskId) {
  return `draft:${workflowId}:${taskId}`;
}

export function useDraftState(taskId, workflowId) {
  const key = storageKey(workflowId, taskId);
  let value = localStorage.getItem(key) ?? "";
  const handlers = new Set();

  function setValue(v) {
    value = v;
    if (v === "") {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, v);
    }
    for (const h of handlers) h(v);
  }

  function clear() {
    localStorage.removeItem(key);
    value = "";
    for (const h of handlers) h("");
  }

  function subscribe(handler) {
    handlers.add(handler);
    return () => handlers.delete(handler);
  }

  return { get value() { return value; }, setValue, clear, subscribe };
}

export function clearAllDrafts(workflowId) {
  const prefix = `draft:${workflowId}:`;
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  for (const k of keys) localStorage.removeItem(k);
}
