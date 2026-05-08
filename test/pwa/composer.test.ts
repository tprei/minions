import { describe, it, expect, beforeEach, vi } from "vitest";
import { createComposer } from "../../pwa/assets/components/composer.js";

describe("createComposer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("renders button with 'Send' in idle mode", () => {
    const { element } = createComposer({ mode: "idle", taskId: "t1", workflowId: "wf1" });
    document.body.appendChild(element);
    const btn = element.querySelector(".composer-btn") as HTMLButtonElement;
    expect(btn.textContent).toContain("Send");
    expect(btn.disabled).toBe(false);
  });

  it("renders 'Queue' button with clock icon in running mode", () => {
    const { element } = createComposer({ mode: "running", taskId: "t1", workflowId: "wf1" });
    document.body.appendChild(element);
    const btn = element.querySelector(".composer-btn") as HTMLButtonElement;
    expect(btn.textContent).toContain("Queue");
    const icon = btn.querySelector(".composer-btn-icon");
    expect(icon).not.toBeNull();
    const hintPrimary = element.querySelector(".composer-hint-primary") as HTMLElement;
    expect(hintPrimary.textContent).toContain("Queued for AI");
    const hintSecondary = element.querySelector(".composer-hint-secondary") as HTMLElement;
    expect(hintSecondary.textContent).toContain("Awaiting completion");
    expect(btn.disabled).toBe(true);
  });

  it("running mode button is disabled — no queue command exists in engine", () => {
    const { element } = createComposer({ mode: "running", taskId: "t1", workflowId: "wf1" });
    const btn = element.querySelector(".composer-btn") as HTMLButtonElement;
    const ta = element.querySelector("textarea") as HTMLTextAreaElement;
    expect(btn.disabled).toBe(true);
    expect(ta.disabled).toBe(false);
  });

  it("running mode submit handler does not call fetch", () => {
    const fetchCalls: unknown[] = [];
    vi.stubGlobal("fetch", (...args: unknown[]) => { fetchCalls.push(args); return Promise.resolve(new Response("{}")); });
    const received: string[] = [];
    const { element } = createComposer({
      mode: "running",
      taskId: "t1",
      workflowId: "wf1",
      onSubmit: (val) => received.push(val),
    });
    const ta = element.querySelector("textarea") as HTMLTextAreaElement;
    const btn = element.querySelector(".composer-btn") as HTMLButtonElement;
    ta.value = "queued message";
    btn.click();
    expect(received).toHaveLength(0);
    expect(fetchCalls).toHaveLength(0);
  });

  it("renders 'Submit' in feedback mode", () => {
    const { element } = createComposer({ mode: "feedback", taskId: "t1", workflowId: "wf1" });
    const btn = element.querySelector(".composer-btn") as HTMLButtonElement;
    expect(btn.textContent).toContain("Submit");
    expect(btn.textContent).not.toContain("retry");
  });

  it("disables button and textarea in disabled mode", () => {
    const { element } = createComposer({ mode: "disabled", taskId: "t1", workflowId: "wf1" });
    const btn = element.querySelector(".composer-btn") as HTMLButtonElement;
    const ta = element.querySelector("textarea") as HTMLTextAreaElement;
    expect(btn.disabled).toBe(true);
    expect(ta.disabled).toBe(true);
  });

  it("setMode transitions to running mode", () => {
    const { element, setMode } = createComposer({ mode: "idle", taskId: "t1", workflowId: "wf1" });
    setMode("running");
    const btn = element.querySelector(".composer-btn") as HTMLButtonElement;
    expect(btn.textContent).toContain("Queue");
  });

  it("getValue returns textarea value", () => {
    const { element, getValue } = createComposer({ mode: "idle", taskId: "t1", workflowId: "wf1" });
    const ta = element.querySelector("textarea") as HTMLTextAreaElement;
    ta.value = "hello world";
    expect(getValue()).toBe("hello world");
  });

  it("setValue sets textarea value and persists draft", () => {
    const { element, setValue } = createComposer({ mode: "idle", taskId: "t1", workflowId: "wf1" });
    setValue("persisted text");
    const ta = element.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta.value).toBe("persisted text");
    expect(localStorage.getItem("draft:wf1:t1")).toBe("persisted text");
  });

  it("reads draft from localStorage on init", () => {
    localStorage.setItem("draft:wf1:t1", "pre-seeded");
    const { element } = createComposer({ mode: "idle", taskId: "t1", workflowId: "wf1" });
    const ta = element.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta.value).toBe("pre-seeded");
  });

  it("calls onSubmit and clears draft on submit", () => {
    const received: Array<[string, string]> = [];
    const { element } = createComposer({
      mode: "idle",
      taskId: "t1",
      workflowId: "wf1",
      onSubmit: (val, mode) => received.push([val, mode]),
    });
    const ta = element.querySelector("textarea") as HTMLTextAreaElement;
    const btn = element.querySelector(".composer-btn") as HTMLButtonElement;
    ta.value = "my message";
    btn.click();
    expect(received).toEqual([["my message", "idle"]]);
    expect(ta.value).toBe("");
    expect(localStorage.getItem("draft:wf1:t1")).toBeNull();
  });

  it("does not call onSubmit when textarea is empty", () => {
    const received: string[] = [];
    const { element } = createComposer({
      mode: "idle",
      taskId: "t1",
      workflowId: "wf1",
      onSubmit: (val) => received.push(val),
    });
    const btn = element.querySelector(".composer-btn") as HTMLButtonElement;
    btn.click();
    expect(received).toHaveLength(0);
  });
});
