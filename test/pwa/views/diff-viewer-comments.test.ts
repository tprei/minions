import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createDiffViewer } from "../../../pwa/assets/views/diff-viewer.js";

const MOCK_FILES = [
  {
    filename: "src/app.ts",
    patch: "@@ -1,3 +1,4 @@\n const x = 1;\n+const y = 2;\n const z = 3;\n const w = 4;",
  },
  { filename: "src/utils.ts", patch: "-old line\n+new line" },
];

function stubMatchMedia(matches: boolean) {
  const mq = {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => mq));
  return mq;
}

function simulateDrag(element: HTMLElement, startIdx: number, endIdx: number) {
  const lines = element.querySelectorAll<HTMLElement>(".diff-line");
  lines[startIdx]?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  lines[endIdx]?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
}

function clickAddComment(element: HTMLElement) {
  const btn = element.querySelector<HTMLElement>(".diff-add-comment-btn");
  if (!btn) throw new Error("Add comment button not found");
  btn.click();
}

function fillAndSaveComment(element: HTMLElement, text: string) {
  const textarea = element.querySelector<HTMLTextAreaElement>(".diff-comment-textarea");
  if (!textarea) throw new Error("Comment textarea not found");
  textarea.value = text;
  const saveBtn = element.querySelector<HTMLElement>(".diff-comment-save-btn");
  if (!saveBtn) throw new Error("Save button not found");
  saveBtn.click();
}

beforeEach(() => {
  document.body.innerHTML = "";
  stubMatchMedia(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("diff-viewer: comment composer", () => {
  it("shows 'Add comment' button after mouseup with a range selected", () => {
    const { element } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    simulateDrag(element, 0, 2);

    const btn = element.querySelector(".diff-add-comment-btn");
    expect(btn).not.toBeNull();
  });

  it("does not show 'Add comment' button before any selection", () => {
    const { element } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    const btn = element.querySelector(".diff-add-comment-btn");
    expect(btn).toBeNull();
  });

  it("clicking Add comment reveals the comment form", () => {
    const { element } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    simulateDrag(element, 0, 2);
    clickAddComment(element);

    const form = element.querySelector(".diff-comment-form");
    expect(form).not.toBeNull();
    const textarea = element.querySelector(".diff-comment-textarea");
    expect(textarea).not.toBeNull();
  });

  it("saving a comment adds it to getComments()", () => {
    const { element, getComments } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    simulateDrag(element, 0, 0);
    clickAddComment(element);
    fillAndSaveComment(element, "Fix this line");

    const comments = getComments();
    expect(comments).toHaveLength(1);
    expect(comments[0]).toEqual({
      kind: "comment",
      path: "src/app.ts",
      line: 0,
      body: "Fix this line",
    });
  });

  it("multi-line range encodes range info in body", () => {
    const { element, getComments } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    simulateDrag(element, 1, 3);
    clickAddComment(element);
    fillAndSaveComment(element, "Refactor these lines");

    const comments = getComments();
    expect(comments).toHaveLength(1);
    const c0 = comments[0];
    expect(c0).not.toBeUndefined();
    expect(c0?.line).toBe(1);
    expect(c0?.body).toContain("Lines 1-3");
    expect(c0?.body).toContain("Refactor these lines");
  });

  it("comment chip appears on the relevant line after save", () => {
    const { element } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    simulateDrag(element, 0, 0);
    clickAddComment(element);
    fillAndSaveComment(element, "Note this");

    const chip = element.querySelector(".diff-comment-chip");
    expect(chip).not.toBeNull();
  });

  it("multiple comments can be added to different ranges", () => {
    const { element, getComments } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    simulateDrag(element, 0, 0);
    clickAddComment(element);
    fillAndSaveComment(element, "First comment");

    simulateDrag(element, 2, 2);
    clickAddComment(element);
    fillAndSaveComment(element, "Second comment");

    const comments = getComments();
    expect(comments).toHaveLength(2);
  });

  it("tapping a chip opens edit form for that comment", () => {
    const { element } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    simulateDrag(element, 0, 0);
    clickAddComment(element);
    fillAndSaveComment(element, "Edit me");

    const chip = element.querySelector<HTMLElement>(".diff-comment-chip");
    chip?.click();

    const form = element.querySelector(".diff-comment-form");
    expect(form).not.toBeNull();
    const textarea = form?.querySelector<HTMLTextAreaElement>(".diff-comment-textarea");
    expect(textarea?.value).toBe("Edit me");
  });

  it("deleting a comment via edit form removes it from getComments()", () => {
    const { element, getComments } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    simulateDrag(element, 0, 0);
    clickAddComment(element);
    fillAndSaveComment(element, "Delete me");

    const chip = element.querySelector<HTMLElement>(".diff-comment-chip");
    chip?.click();

    const deleteBtn = element.querySelector<HTMLElement>(".diff-comment-delete-btn");
    deleteBtn?.click();

    expect(getComments()).toHaveLength(0);
    expect(element.querySelector(".diff-comment-chip")).toBeNull();
  });

  it("cancel on comment form removes the form without saving", () => {
    const { element, getComments } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    simulateDrag(element, 0, 0);
    clickAddComment(element);

    const cancelBtn = element.querySelector<HTMLElement>(".diff-comment-cancel-btn");
    cancelBtn?.click();

    expect(getComments()).toHaveLength(0);
    expect(element.querySelector(".diff-comment-form")).toBeNull();
  });

  it("shows Send to agent button when comments exist", () => {
    const { element } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    simulateDrag(element, 0, 0);
    clickAddComment(element);
    fillAndSaveComment(element, "Fix this");

    const sendBtn = element.querySelector(".diff-send-btn");
    expect(sendBtn).not.toBeNull();
    expect(sendBtn?.textContent).toContain("Send to agent (1)");
  });

  it("Send to agent button count reflects number of comments", () => {
    const { element } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    simulateDrag(element, 0, 0);
    clickAddComment(element);
    fillAndSaveComment(element, "First");

    simulateDrag(element, 2, 2);
    clickAddComment(element);
    fillAndSaveComment(element, "Second");

    const sendBtn = element.querySelector(".diff-send-btn");
    expect(sendBtn?.textContent).toContain("Send to agent (2)");
  });

  it("onSend callback fires with correct comment shape when Send is clicked", () => {
    const { element, onSend } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    const received: unknown[] = [];
    onSend((comments) => received.push(...comments));

    simulateDrag(element, 0, 0);
    clickAddComment(element);
    fillAndSaveComment(element, "Agent review");

    const sendBtn = element.querySelector<HTMLElement>(".diff-send-btn");
    sendBtn?.click();

    expect(received).toHaveLength(1);
    const comment = received[0] as Record<string, unknown>;
    expect(comment.kind).toBe("comment");
    expect(comment.path).toBe("src/app.ts");
    expect(typeof comment.line).toBe("number");
    expect(typeof comment.body).toBe("string");
    expect(Object.keys(comment).sort()).toEqual(["body", "kind", "line", "path"]);
  });

  it("getComments() returns exact E1 schema — no extra fields", () => {
    const { element, getComments } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    simulateDrag(element, 0, 0);
    clickAddComment(element);
    fillAndSaveComment(element, "Schema check");

    const comments = getComments();
    const comment = comments[0];
    expect(comment).not.toBeUndefined();
    if (comment) {
      expect(Object.keys(comment).sort()).toEqual(["body", "kind", "line", "path"]);
    }
  });
});
