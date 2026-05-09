import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "../../../../pwa/assets/transcript/events/approval.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

const BASE_EVENT = {
  kind: "permission_request",
  id: "req-1",
  tool: "Bash",
  input: { cmd: "ls" },
};

const BASE_CTX = {
  workflowId: "wf1",
  taskId: "t1",
};

describe("approval card render", () => {
  it("renders with te-approval class and request id", () => {
    const el = render(BASE_EVENT, BASE_CTX);
    expect(el.className).toContain("te-approval");
    expect(el.dataset.requestId).toBe("req-1");
  });

  it("shows tool name in header", () => {
    const el = render(BASE_EVENT, BASE_CTX);
    const header = el.querySelector(".te-approval-header");
    expect(header?.textContent).toContain("Bash");
  });

  it("shows input preview", () => {
    const el = render(BASE_EVENT, BASE_CTX);
    const preview = el.querySelector(".te-approval-input-preview");
    expect(preview?.textContent).toContain("cmd");
  });

  it("default state shows Approve and Deny buttons", () => {
    const el = render(BASE_EVENT, BASE_CTX);
    const approveBtn = el.querySelector(".te-approval-approve-btn") as HTMLButtonElement;
    const denyBtn = el.querySelector(".te-approval-deny-btn") as HTMLButtonElement;
    expect(approveBtn).not.toBeNull();
    expect(denyBtn).not.toBeNull();
    expect(approveBtn.textContent).toContain("Approve");
    expect(denyBtn.textContent).toContain("Deny");
  });

  it("deny form is hidden by default", () => {
    const el = render(BASE_EVENT, BASE_CTX);
    const denyForm = el.querySelector(".te-approval-deny-form") as HTMLElement;
    expect(denyForm.hidden).toBe(true);
  });

  it("clicking Deny shows deny form and hides default actions", () => {
    const el = render(BASE_EVENT, BASE_CTX);
    const denyBtn = el.querySelector(".te-approval-deny-btn") as HTMLButtonElement;
    denyBtn.click();
    const denyForm = el.querySelector(".te-approval-deny-form") as HTMLElement;
    const defaultActions = el.querySelector(".te-approval-actions") as HTMLElement;
    expect(denyForm.hidden).toBe(false);
    expect(defaultActions.hidden).toBe(true);
  });

  it("Submit Deny button is disabled when textarea is empty", () => {
    const el = render(BASE_EVENT, BASE_CTX);
    const denyBtn = el.querySelector(".te-approval-deny-btn") as HTMLButtonElement;
    denyBtn.click();
    const submitBtn = el.querySelector(".te-approval-submit-deny-btn") as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it("Submit Deny button enables when textarea has content", () => {
    const el = render(BASE_EVENT, BASE_CTX);
    const denyBtn = el.querySelector(".te-approval-deny-btn") as HTMLButtonElement;
    denyBtn.click();
    const textarea = el.querySelector(".te-approval-deny-textarea") as HTMLTextAreaElement;
    const submitBtn = el.querySelector(".te-approval-submit-deny-btn") as HTMLButtonElement;
    textarea.value = "not allowed";
    textarea.dispatchEvent(new Event("input"));
    expect(submitBtn.disabled).toBe(false);
  });

  it("Back button returns to default actions view", () => {
    const el = render(BASE_EVENT, BASE_CTX);
    const denyBtn = el.querySelector(".te-approval-deny-btn") as HTMLButtonElement;
    denyBtn.click();
    const backBtn = el.querySelector(".te-approval-back-btn") as HTMLButtonElement;
    backBtn.click();
    const denyForm = el.querySelector(".te-approval-deny-form") as HTMLElement;
    const defaultActions = el.querySelector(".te-approval-actions") as HTMLElement;
    expect(denyForm.hidden).toBe(true);
    expect(defaultActions.hidden).toBe(false);
  });
});

describe("approval card approve flow", () => {
  it("Approve POSTs correct body shape", async () => {
    const fetchCalls: unknown[] = [];
    vi.stubGlobal("fetch", (url: string, opts: unknown) => {
      fetchCalls.push({ url, opts });
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const el = render(BASE_EVENT, BASE_CTX);
    const approveBtn = el.querySelector(".te-approval-approve-btn") as HTMLButtonElement;
    approveBtn.click();

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchCalls).toHaveLength(1);
    const call = fetchCalls[0] as { url: string; opts: RequestInit };
    expect(call.url).toBe("/commands");
    const body = JSON.parse(call.opts.body as string);
    expect(body).toMatchObject({
      kind: "approve-permission",
      workflowId: "wf1",
      taskId: "t1",
      requestId: "req-1",
      decision: "approve",
    });
    expect(body.reason).toBeUndefined();
  });

  it("shows success state after approve", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 200 })));
    const el = render(BASE_EVENT, BASE_CTX);
    const approveBtn = el.querySelector(".te-approval-approve-btn") as HTMLButtonElement;
    approveBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    const success = el.querySelector(".te-approval-success") as HTMLElement;
    expect(success.hidden).toBe(false);
    expect(success.textContent).toContain("Approved");
  });

  it("shows error inline on non-2xx, does not toast", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 500 })));
    const el = render(BASE_EVENT, BASE_CTX);
    document.body.appendChild(el);
    const approveBtn = el.querySelector(".te-approval-approve-btn") as HTMLButtonElement;
    approveBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    const errMsg = el.querySelector(".te-approval-error") as HTMLElement;
    expect(errMsg.hidden).toBe(false);
    expect(errMsg.textContent).toContain("500");
    const success = el.querySelector(".te-approval-success") as HTMLElement;
    expect(success.hidden).toBe(true);
  });
});

describe("approval card deny flow", () => {
  it("deny with reason POSTs correct body", async () => {
    const fetchCalls: unknown[] = [];
    vi.stubGlobal("fetch", (url: string, opts: unknown) => {
      fetchCalls.push({ url, opts });
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const el = render(BASE_EVENT, BASE_CTX);
    const denyBtn = el.querySelector(".te-approval-deny-btn") as HTMLButtonElement;
    denyBtn.click();

    const textarea = el.querySelector(".te-approval-deny-textarea") as HTMLTextAreaElement;
    textarea.value = "security risk";
    textarea.dispatchEvent(new Event("input"));

    const submitBtn = el.querySelector(".te-approval-submit-deny-btn") as HTMLButtonElement;
    submitBtn.click();

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchCalls).toHaveLength(1);
    const call = fetchCalls[0] as { url: string; opts: RequestInit };
    const body = JSON.parse(call.opts.body as string);
    expect(body).toMatchObject({
      kind: "approve-permission",
      workflowId: "wf1",
      taskId: "t1",
      requestId: "req-1",
      decision: "deny",
      reason: "security risk",
    });
  });

  it("deny without reason does not POST (submit button stays disabled)", () => {
    const fetchCalls: unknown[] = [];
    vi.stubGlobal("fetch", (url: string, opts: unknown) => {
      fetchCalls.push({ url, opts });
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const el = render(BASE_EVENT, BASE_CTX);
    const denyBtn = el.querySelector(".te-approval-deny-btn") as HTMLButtonElement;
    denyBtn.click();

    const submitBtn = el.querySelector(".te-approval-submit-deny-btn") as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    submitBtn.click();
    expect(fetchCalls).toHaveLength(0);
  });

  it("shows success state after deny", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 200 })));
    const el = render(BASE_EVENT, BASE_CTX);
    const denyBtn = el.querySelector(".te-approval-deny-btn") as HTMLButtonElement;
    denyBtn.click();
    const textarea = el.querySelector(".te-approval-deny-textarea") as HTMLTextAreaElement;
    textarea.value = "reason";
    textarea.dispatchEvent(new Event("input"));
    const submitBtn = el.querySelector(".te-approval-submit-deny-btn") as HTMLButtonElement;
    submitBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    const success = el.querySelector(".te-approval-success") as HTMLElement;
    expect(success.hidden).toBe(false);
    expect(success.textContent).toContain("Denied");
  });

  it("shows error inline on non-2xx deny, re-enables buttons", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 500 })));
    const el = render(BASE_EVENT, BASE_CTX);
    const denyBtn = el.querySelector(".te-approval-deny-btn") as HTMLButtonElement;
    denyBtn.click();
    const textarea = el.querySelector(".te-approval-deny-textarea") as HTMLTextAreaElement;
    textarea.value = "reason";
    textarea.dispatchEvent(new Event("input"));
    const submitBtn = el.querySelector(".te-approval-submit-deny-btn") as HTMLButtonElement;
    submitBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    const errMsg = el.querySelector(".te-approval-error") as HTMLElement;
    expect(errMsg.hidden).toBe(false);
    expect(submitBtn.disabled).toBe(false);
  });

  it("onResolved callback called after approve", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 200 })));
    const resolved: string[] = [];
    const el = render(BASE_EVENT, { ...BASE_CTX, onResolved: (id) => resolved.push(id) });
    const approveBtn = el.querySelector(".te-approval-approve-btn") as HTMLButtonElement;
    approveBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toEqual(["req-1"]);
  });
});
