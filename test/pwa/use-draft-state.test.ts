import { describe, it, expect, beforeEach } from "vitest";
import { useDraftState, clearAllDrafts } from "../../pwa/assets/hooks/use-draft-state.js";

describe("useDraftState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads empty value when no key set", () => {
    const draft = useDraftState("task-1", "wf-1");
    expect(draft.value).toBe("");
  });

  it("reads persisted value from localStorage on attach", () => {
    localStorage.setItem("draft:wf-1:task-1", "hello");
    const draft = useDraftState("task-1", "wf-1");
    expect(draft.value).toBe("hello");
  });

  it("setValue persists to localStorage", () => {
    const draft = useDraftState("task-1", "wf-1");
    draft.setValue("world");
    expect(localStorage.getItem("draft:wf-1:task-1")).toBe("world");
    expect(draft.value).toBe("world");
  });

  it("setValue with empty string removes the key", () => {
    const draft = useDraftState("task-1", "wf-1");
    draft.setValue("abc");
    draft.setValue("");
    expect(localStorage.getItem("draft:wf-1:task-1")).toBeNull();
  });

  it("clear() removes the key and resets value", () => {
    const draft = useDraftState("task-1", "wf-1");
    draft.setValue("draft content");
    draft.clear();
    expect(draft.value).toBe("");
    expect(localStorage.getItem("draft:wf-1:task-1")).toBeNull();
  });

  it("subscribe handler fires on setValue", () => {
    const draft = useDraftState("task-1", "wf-1");
    const received: string[] = [];
    draft.subscribe((v) => received.push(v));
    draft.setValue("a");
    draft.setValue("b");
    expect(received).toEqual(["a", "b"]);
  });

  it("subscribe handler fires on clear", () => {
    const draft = useDraftState("task-1", "wf-1");
    const received: string[] = [];
    draft.setValue("x");
    draft.subscribe((v) => received.push(v));
    draft.clear();
    expect(received).toEqual([""]);
  });

  it("unsubscribe stops receiving updates", () => {
    const draft = useDraftState("task-1", "wf-1");
    const received: string[] = [];
    const unsub = draft.subscribe((v) => received.push(v));
    draft.setValue("first");
    unsub();
    draft.setValue("second");
    expect(received).toEqual(["first"]);
  });

  it("isolates keys by workflowId and taskId", () => {
    const draft1 = useDraftState("task-1", "wf-1");
    const draft2 = useDraftState("task-2", "wf-1");
    const draft3 = useDraftState("task-1", "wf-2");
    draft1.setValue("aaa");
    draft2.setValue("bbb");
    draft3.setValue("ccc");
    expect(draft1.value).toBe("aaa");
    expect(draft2.value).toBe("bbb");
    expect(draft3.value).toBe("ccc");
  });
});

describe("clearAllDrafts", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("removes all draft keys for a workflow", () => {
    localStorage.setItem("draft:wf-1:task-1", "a");
    localStorage.setItem("draft:wf-1:task-2", "b");
    localStorage.setItem("draft:wf-2:task-1", "c");
    clearAllDrafts("wf-1");
    expect(localStorage.getItem("draft:wf-1:task-1")).toBeNull();
    expect(localStorage.getItem("draft:wf-1:task-2")).toBeNull();
    expect(localStorage.getItem("draft:wf-2:task-1")).toBe("c");
  });

  it("no-ops when no matching keys exist", () => {
    localStorage.setItem("draft:wf-2:task-1", "x");
    clearAllDrafts("wf-1");
    expect(localStorage.getItem("draft:wf-2:task-1")).toBe("x");
  });
});
