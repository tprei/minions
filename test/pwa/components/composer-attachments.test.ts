import { describe, it, expect, beforeEach } from "vitest";
import { createComposer } from "../../../pwa/assets/components/composer.js";

const SAMPLE_ATTACHMENTS = [
  { kind: "comment" as const, path: "src/app.ts", line: 3, body: "Fix this logic" },
  { kind: "comment" as const, path: "src/utils.ts", line: 7, body: "Lines 7-9: Refactor loop" },
];

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("composer: attachment pill", () => {
  it("pill is hidden by default", () => {
    const { element } = createComposer({ mode: "idle", taskId: "t1", workflowId: "wf1" });
    document.body.appendChild(element);

    const pill = element.querySelector<HTMLElement>(".composer-attachment-pill");
    expect(pill?.style.display).toBe("none");
  });

  it("setAttachments shows pill with correct count", () => {
    const { element, setAttachments } = createComposer({ mode: "idle", taskId: "t1", workflowId: "wf1" });
    document.body.appendChild(element);

    setAttachments(SAMPLE_ATTACHMENTS);

    const pill = element.querySelector<HTMLElement>(".composer-attachment-pill");
    expect(pill?.style.display).not.toBe("none");
    const pillLabel = element.querySelector<HTMLElement>(".composer-attachment-pill-label");
    expect(pillLabel?.textContent).toBe("Queued for AI · 2 comments");
  });

  it("setAttachments with empty array hides pill", () => {
    const { element, setAttachments } = createComposer({ mode: "idle", taskId: "t1", workflowId: "wf1" });
    document.body.appendChild(element);

    setAttachments(SAMPLE_ATTACHMENTS);
    setAttachments([]);

    const pill = element.querySelector<HTMLElement>(".composer-attachment-pill");
    expect(pill?.style.display).toBe("none");
  });

  it("singular count: 1 comment (not 1 comments)", () => {
    const { element, setAttachments } = createComposer({ mode: "idle", taskId: "t1", workflowId: "wf1" });
    document.body.appendChild(element);

    const first = SAMPLE_ATTACHMENTS[0];
    if (!first) throw new Error("missing fixture");
    setAttachments([first]);

    const pillLabel = element.querySelector<HTMLElement>(".composer-attachment-pill-label");
    expect(pillLabel?.textContent).toBe("Queued for AI · 1 comment");
  });

  it("tapping pill label toggles the attachment list", () => {
    const { element, setAttachments } = createComposer({ mode: "idle", taskId: "t1", workflowId: "wf1" });
    document.body.appendChild(element);

    setAttachments(SAMPLE_ATTACHMENTS);

    const pillLabel = element.querySelector<HTMLElement>(".composer-attachment-pill-label");
    const list = element.querySelector<HTMLElement>(".composer-attachment-list");

    expect(list?.style.display).toBe("none");

    pillLabel?.click();
    expect(list?.style.display).not.toBe("none");

    pillLabel?.click();
    expect(list?.style.display).toBe("none");
  });

  it("expanded list shows one item per attachment", () => {
    const { element, setAttachments } = createComposer({ mode: "idle", taskId: "t1", workflowId: "wf1" });
    document.body.appendChild(element);

    setAttachments(SAMPLE_ATTACHMENTS);

    const pillLabel = element.querySelector<HTMLElement>(".composer-attachment-pill-label");
    pillLabel?.click();

    const items = element.querySelectorAll(".composer-attachment-item");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain("src/app.ts:3");
    expect(items[1]?.textContent).toContain("src/utils.ts:7");
  });

  it("tapping an attachment item calls onCommentJump with that attachment", () => {
    const { element, setAttachments, onCommentJump } = createComposer({
      mode: "idle",
      taskId: "t1",
      workflowId: "wf1",
    });
    document.body.appendChild(element);

    setAttachments(SAMPLE_ATTACHMENTS);

    const jumped: unknown[] = [];
    onCommentJump((att) => jumped.push(att));

    const pillLabel = element.querySelector<HTMLElement>(".composer-attachment-pill-label");
    pillLabel?.click();

    const items = element.querySelectorAll<HTMLElement>(".composer-attachment-item");
    items[0]?.click();

    expect(jumped).toHaveLength(1);
    expect(jumped[0]).toEqual(SAMPLE_ATTACHMENTS[0]);
  });

  it("getValue returns textarea text only", () => {
    const { element, getValue, setAttachments } = createComposer({
      mode: "idle",
      taskId: "t1",
      workflowId: "wf1",
    });
    document.body.appendChild(element);

    setAttachments(SAMPLE_ATTACHMENTS);
    const ta = element.querySelector<HTMLTextAreaElement>("textarea");
    if (ta) ta.value = "my message";

    expect(getValue()).toBe("my message");
  });

  it("getAttachments returns the queued attachments", () => {
    const { getAttachments, setAttachments } = createComposer({
      mode: "idle",
      taskId: "t1",
      workflowId: "wf1",
    });

    setAttachments(SAMPLE_ATTACHMENTS);
    expect(getAttachments()).toEqual(SAMPLE_ATTACHMENTS);
  });

  it("onSubmit callback receives attachments as third argument", () => {
    const received: Array<[string, string, unknown]> = [];
    const { element, setAttachments } = createComposer({
      mode: "idle",
      taskId: "t1",
      workflowId: "wf1",
      onSubmit: (val, mode, attachments) => received.push([val, mode, attachments]),
    });
    document.body.appendChild(element);

    setAttachments(SAMPLE_ATTACHMENTS);
    const ta = element.querySelector<HTMLTextAreaElement>("textarea");
    if (ta) ta.value = "review this";

    const btn = element.querySelector<HTMLButtonElement>(".composer-btn");
    btn?.click();

    expect(received).toHaveLength(1);
    expect(received[0]?.[0]).toBe("review this");
    expect(received[0]?.[2]).toEqual(SAMPLE_ATTACHMENTS);
  });

  it("submit clears both textarea and attachments", () => {
    const { element, getAttachments, setAttachments } = createComposer({
      mode: "idle",
      taskId: "t1",
      workflowId: "wf1",
      onSubmit: () => {},
    });
    document.body.appendChild(element);

    setAttachments(SAMPLE_ATTACHMENTS);
    const ta = element.querySelector<HTMLTextAreaElement>("textarea");
    if (ta) ta.value = "done";

    const btn = element.querySelector<HTMLButtonElement>(".composer-btn");
    btn?.click();

    expect(ta?.value).toBe("");
    expect(getAttachments()).toHaveLength(0);

    const pill = element.querySelector<HTMLElement>(".composer-attachment-pill");
    expect(pill?.style.display).toBe("none");
  });

  it("onSubmit without attachments passes undefined as third arg", () => {
    const received: Array<unknown> = [];
    const { element } = createComposer({
      mode: "idle",
      taskId: "t1",
      workflowId: "wf1",
      onSubmit: (_val, _mode, attachments) => received.push(attachments),
    });
    document.body.appendChild(element);

    const ta = element.querySelector<HTMLTextAreaElement>("textarea");
    if (ta) ta.value = "no attachments";

    const btn = element.querySelector<HTMLButtonElement>(".composer-btn");
    btn?.click();

    expect(received[0]).toBeUndefined();
  });
});
