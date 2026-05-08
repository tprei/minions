import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createNewWorkflowSheet, buildPostBody } from "../../../pwa/assets/views/new-workflow-sheet.js";

beforeEach(() => {
  document.body.innerHTML = "";
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildPostBody", () => {
  it("single-task: produces correct body shape", () => {
    const body = buildPostBody({
      title: "",
      prompt: "Fix the bug",
      kind: "single-task",
      policy: { autoLand: false, autoMergeOnGreen: false, maxConcurrent: 1 },
      tasks: [],
    });

    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(0);
    expect(body.kind).toBe("single-task");
    expect(Array.isArray(body.tasks)).toBe(true);
    expect(body.tasks).toHaveLength(1);
    const task0 = body.tasks[0];
    expect(task0?.id).toBe("T1");
    expect(task0?.prompt).toBe("Fix the bug");
    expect(typeof task0?.title).toBe("string");
  });

  it("single-task: omits title when empty", () => {
    const body = buildPostBody({
      title: "",
      prompt: "Do something",
      kind: "single-task",
      policy: { autoLand: false, autoMergeOnGreen: false, maxConcurrent: 1 },
      tasks: [],
    });
    expect("title" in body).toBe(false);
  });

  it("single-task: includes title when provided", () => {
    const body = buildPostBody({
      title: "My Workflow",
      prompt: "Do something",
      kind: "single-task",
      policy: { autoLand: false, autoMergeOnGreen: false, maxConcurrent: 1 },
      tasks: [],
    });
    expect(body.title).toBe("My Workflow");
  });

  it("single-task: includes policy when non-default values present", () => {
    const body = buildPostBody({
      title: "",
      prompt: "Do something",
      kind: "single-task",
      policy: { autoLand: true, autoMergeOnGreen: false, maxConcurrent: 3 },
      tasks: [],
    });
    expect(body.policy).toBeDefined();
    expect(body.policy?.autoLand).toBe(true);
    expect(body.policy?.maxConcurrent).toBe(3);
  });

  it("multi-task: assigns T1, T2 ids and sets dependsOn", () => {
    const tasks = [
      { title: "First", prompt: "Do X", dependsOn: [] },
      { title: "Second", prompt: "Do Y", dependsOn: ["T1"] },
    ];
    const body = buildPostBody({
      title: "",
      prompt: "",
      kind: "multi-task",
      policy: { autoLand: false, autoMergeOnGreen: false, maxConcurrent: 2 },
      tasks,
    });

    expect(body.kind).toBe("multi-task");
    expect(body.tasks).toHaveLength(2);
    const mt0 = body.tasks[0];
    const mt1 = body.tasks[1];
    expect(mt0?.id).toBe("T1");
    expect(mt1?.id).toBe("T2");
    expect(mt1?.dependsOn).toEqual(["T1"]);
  });

  it("multi-task: task without dependsOn omits the field", () => {
    const tasks = [
      { title: "", prompt: "Only task", dependsOn: [] },
    ];
    const body = buildPostBody({
      title: "",
      prompt: "",
      kind: "multi-task",
      policy: { autoLand: false, autoMergeOnGreen: false, maxConcurrent: 1 },
      tasks,
    });
    const noDepTask = body.tasks[0];
    expect(noDepTask !== undefined && "dependsOn" in noDepTask).toBe(false);
  });

  it("policy is omitted when all values are falsy/default", () => {
    const body = buildPostBody({
      title: "",
      prompt: "p",
      kind: "single-task",
      policy: { autoLand: false, autoMergeOnGreen: false, maxConcurrent: 1 },
      tasks: [],
    });
    expect("policy" in body).toBe(false);
  });
});

describe("createNewWorkflowSheet", () => {
  function mountSheet() {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    const sheet = createNewWorkflowSheet({ onSubmit, onClose });
    return { sheet, onSubmit, onClose };
  }

  it("returns element, open, close functions", () => {
    const { sheet } = mountSheet();
    expect(typeof sheet.open).toBe("function");
    expect(typeof sheet.close).toBe("function");
    expect(sheet.element instanceof HTMLElement).toBe(true);
  });

  it("open() reveals the sheet panel", () => {
    const { sheet } = mountSheet();
    sheet.open();
    const panel = document.querySelector(".sheet-panel");
    expect(panel?.classList.contains("open")).toBe(true);
  });

  it("shows prompt textarea", () => {
    const { sheet } = mountSheet();
    sheet.open();
    const ta = document.querySelector(".nwf-prompt") as HTMLTextAreaElement | null;
    expect(ta).not.toBeNull();
  });

  it("shows title input", () => {
    const { sheet } = mountSheet();
    sheet.open();
    const input = document.querySelector(".nwf-title") as HTMLInputElement | null;
    expect(input).not.toBeNull();
  });

  it("shows single-task and multi-task segment buttons", () => {
    const { sheet } = mountSheet();
    sheet.open();
    const segments = document.querySelectorAll(".nwf-segment");
    expect(segments).toHaveLength(2);
    const seg0 = segments[0];
    const seg1 = segments[1];
    expect(seg0?.textContent).toContain("single-task");
    expect(seg1?.textContent).toContain("multi-task");
  });

  it("multi-task section is hidden by default", () => {
    const { sheet } = mountSheet();
    sheet.open();
    const section = document.querySelector(".nwf-multi-task-section") as HTMLElement | null;
    expect(section?.style.display).toBe("none");
  });

  it("clicking multi-task segment reveals the multi-task section", () => {
    const { sheet } = mountSheet();
    sheet.open();
    const multiBtn = document.querySelector(".nwf-segment:last-child") as HTMLButtonElement;
    multiBtn.click();
    const section = document.querySelector(".nwf-multi-task-section") as HTMLElement | null;
    expect(section?.style.display).not.toBe("none");
  });

  it("shows policy controls", () => {
    const { sheet } = mountSheet();
    sheet.open();
    expect(document.querySelector("#nwf-auto-land")).not.toBeNull();
    expect(document.querySelector("#nwf-auto-merge")).not.toBeNull();
    expect(document.querySelector("#nwf-max-concurrent")).not.toBeNull();
  });

  it("submit with empty prompt shows error, does not call fetch", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "wf-1" }) });
    vi.stubGlobal("fetch", fetchSpy);

    const { sheet } = mountSheet();
    sheet.open();

    const btn = document.querySelector(".nwf-submit-btn") as HTMLButtonElement;
    btn.click();

    await Promise.resolve();

    const errorEl = document.querySelector(".nwf-error") as HTMLElement;
    expect(errorEl.style.display).not.toBe("none");
    expect(errorEl.textContent).toContain("required");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("single-task submit with valid prompt calls POST /workflows with correct shape", async () => {
    let capturedBody: unknown = null;
    const fetchSpy = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
      capturedBody = JSON.parse(opts.body as string);
      return { ok: true, json: async () => ({ id: "wf-created" }) };
    });
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("location", { hash: "" });

    const { sheet, onSubmit } = mountSheet();
    sheet.open();

    const ta = document.querySelector(".nwf-prompt") as HTMLTextAreaElement;
    ta.value = "Build a feature";
    ta.dispatchEvent(new Event("input"));

    const btn = document.querySelector(".nwf-submit-btn") as HTMLButtonElement;
    btn.click();

    await new Promise((r) => setTimeout(r, 0));

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/workflows");
    expect(opts.method).toBe("POST");

    const body = capturedBody as Record<string, unknown>;
    expect(typeof body.id).toBe("string");
    expect(body.kind).toBe("single-task");
    expect(Array.isArray(body.tasks)).toBe(true);
    const tasks = body.tasks as Array<{ id: string; prompt: string; title: string }>;
    const task0 = tasks[0];
    expect(task0?.id).toBe("T1");
    expect(task0?.prompt).toBe("Build a feature");
    expect(typeof task0?.title).toBe("string");

    expect(onSubmit).toHaveBeenCalledWith("wf-created");
  });

  it("multi-task submit includes tasks array with correct dependsOn", async () => {
    let capturedBody: unknown = null;
    const fetchSpy = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
      capturedBody = JSON.parse(opts.body as string);
      return { ok: true, json: async () => ({ id: "wf-multi" }) };
    });
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("location", { hash: "" });

    const { sheet } = mountSheet();
    sheet.open();

    const multiBtn = document.querySelector(".nwf-segment:last-child") as HTMLButtonElement;
    multiBtn.click();

    const addBtn = document.querySelector(".nwf-add-task-btn") as HTMLButtonElement;
    addBtn.click();

    const prompts = document.querySelectorAll(".nwf-task-prompt") as NodeListOf<HTMLTextAreaElement>;
    const p0 = prompts[0];
    const p1 = prompts[1];
    if (!p0 || !p1) throw new Error("Expected 2 task prompts");
    p0.value = "First task prompt";
    p0.dispatchEvent(new Event("input"));
    p1.value = "Second task prompt";
    p1.dispatchEvent(new Event("input"));

    const depChip = document.querySelector(".nwf-dep-chip[data-dep='T1']") as HTMLButtonElement;
    if (depChip) depChip.click();

    const btn = document.querySelector(".nwf-submit-btn") as HTMLButtonElement;
    btn.click();

    await new Promise((r) => setTimeout(r, 0));

    const body = capturedBody as Record<string, unknown>;
    expect(body.kind).toBe("multi-task");
    const tasks = body.tasks as Array<{ id: string; prompt: string; dependsOn?: string[] }>;
    expect(tasks).toHaveLength(2);
    const t0 = tasks[0];
    const t1 = tasks[1];
    expect(t0?.id).toBe("T1");
    expect(t1?.id).toBe("T2");
    expect(t1?.dependsOn).toContain("T1");
  });

  it("on 4xx response shows error and does not navigate", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "Bad prompt" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { sheet, onSubmit } = mountSheet();
    sheet.open();

    const ta = document.querySelector(".nwf-prompt") as HTMLTextAreaElement;
    ta.value = "Something";
    ta.dispatchEvent(new Event("input"));

    const btn = document.querySelector(".nwf-submit-btn") as HTMLButtonElement;
    btn.click();

    await new Promise((r) => setTimeout(r, 0));

    const errorEl = document.querySelector(".nwf-error") as HTMLElement;
    expect(errorEl.style.display).not.toBe("none");
    expect(errorEl.textContent).toContain("Bad prompt");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
