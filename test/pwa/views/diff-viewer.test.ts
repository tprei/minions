import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createDiffViewer } from "../../../pwa/assets/views/diff-viewer.js";

const MOCK_FILES = [
  { filename: "src/app.ts", patch: "@@ -1,3 +1,4 @@\n const x = 1;\n+const y = 2;\n const z = 3;" },
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

beforeEach(() => {
  document.body.innerHTML = "";
  stubMatchMedia(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createDiffViewer", () => {
  it("renders root element with diff-viewer class", () => {
    const { element } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    expect(element.className).toContain("diff-viewer");
  });

  it("renders file tree with file items", () => {
    const { element } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    const items = element.querySelectorAll(".diff-tree-item");
    expect(items.length).toBe(2);
    expect(items[0]?.textContent).toBe("src/app.ts");
    expect(items[1]?.textContent).toBe("src/utils.ts");
  });

  it("shows empty state when no files", () => {
    const { element } = createDiffViewer({ prDetail: {}, files: [] });
    document.body.appendChild(element);

    const empty = element.querySelector(".diff-tree-empty");
    expect(empty).not.toBeNull();
  });

  it("auto-selects first file and renders its diff", () => {
    const { element } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    const filename = element.querySelector(".diff-filename");
    expect(filename?.textContent).toBe("src/app.ts");
  });

  it("renders diff lines with add/del classes", () => {
    const { element } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    const addLines = element.querySelectorAll(".diff-add");
    expect(addLines.length).toBeGreaterThan(0);
  });

  it("clicking a different file renders that file's diff", () => {
    const { element } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    const items = element.querySelectorAll(".diff-tree-item");
    (items[1] as HTMLElement).click();

    const filename = element.querySelector(".diff-filename");
    expect(filename?.textContent).toBe("src/utils.ts");
  });

  it("viewport flip: side-by-side class at >=768px", () => {
    stubMatchMedia(true);
    const { element } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    expect(element.classList.contains("diff-viewer-side-by-side")).toBe(true);
    expect(element.classList.contains("diff-viewer-unified")).toBe(false);
  });

  it("viewport flip: unified class at <768px", () => {
    stubMatchMedia(false);
    const { element } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    expect(element.classList.contains("diff-viewer-unified")).toBe(true);
    expect(element.classList.contains("diff-viewer-side-by-side")).toBe(false);
  });

  it("viewport flip: responds to matchMedia change event", () => {
    let mqChangeHandler: ((e: { matches: boolean }) => void) | undefined;
    const mq = {
      matches: true,
      addEventListener: vi.fn((_evt: string, handler: (e: { matches: boolean }) => void) => {
        mqChangeHandler = handler;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("matchMedia", vi.fn(() => mq));

    const { element } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    expect(element.classList.contains("diff-viewer-side-by-side")).toBe(true);

    mqChangeHandler?.({ matches: false });
    expect(element.classList.contains("diff-viewer-unified")).toBe(true);
    expect(element.classList.contains("diff-viewer-side-by-side")).toBe(false);
  });

  it("line-range selection: getSelectedRange returns null before mousedown", () => {
    const { getSelectedRange } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    expect(getSelectedRange()).toBeNull();
  });

  it("line-range selection: getSelectedRange updates on mousedown", () => {
    const { element, getSelectedRange } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    const firstLine = element.querySelector(".diff-line") as HTMLElement | null;
    if (firstLine) {
      firstLine.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    }

    const range = getSelectedRange();
    expect(range).not.toBeNull();
    expect(range?.start).toBe(0);
    expect(range?.end).toBe(0);
  });

  it("line-range selection: drag extends the range", () => {
    const { element, getSelectedRange } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);

    const lines = element.querySelectorAll(".diff-line");
    const firstLine = lines[0] as HTMLElement | null;
    const thirdLine = lines[2] as HTMLElement | null;

    if (firstLine) {
      firstLine.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    }
    if (thirdLine) {
      thirdLine.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    }

    const range = getSelectedRange();
    expect(range?.start).toBe(0);
    expect(range?.end).toBe(2);
  });

  it("destroy() removes element and cleans up matchMedia listener", () => {
    const mq = {
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("matchMedia", vi.fn(() => mq));

    const { element, destroy } = createDiffViewer({ prDetail: {}, files: MOCK_FILES });
    document.body.appendChild(element);
    destroy();

    expect(document.body.contains(element)).toBe(false);
    expect(mq.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
