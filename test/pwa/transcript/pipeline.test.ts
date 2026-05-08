import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("/assets/vendor/marked.esm.js", () => ({
  marked: {
    parse: (text: string) => `<p>${text}</p>`,
    setOptions: () => {},
  },
}));

vi.mock("/assets/vendor/dompurify.esm.js", () => ({
  default: {
    sanitize: (html: string) => html,
  },
}));

class MockIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

(globalThis as any).IntersectionObserver = MockIntersectionObserver;

import { createTranscriptPipeline } from "../../../pwa/assets/transcript/pipeline.js";

function makeScroller(): HTMLElement {
  const el = document.createElement("div");
  el.style.height = "400px";
  el.style.overflow = "auto";
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("cluster body always appended, hidden toggled separately", () => {
  it("collapsed cluster body contains all rows after growing, then expanding shows full count", () => {
    const scroller = makeScroller();
    const pipeline = createTranscriptPipeline(scroller);

    pipeline.appendEvent({ kind: "tool_call", id: "tc1", name: "Read", input: { path: "a" } });
    pipeline.appendEvent({ kind: "tool_call", id: "tc2", name: "Read", input: { path: "b" } });
    pipeline.appendEvent({ kind: "tool_call", id: "tc3", name: "Read", input: { path: "c" } });

    const clusterEl1 = scroller.querySelector(".te-cluster") as HTMLElement & { _group: any; _body: HTMLElement };
    expect(clusterEl1).not.toBeNull();
    const group = clusterEl1._group;
    expect(group.expanded).toBe(false);

    pipeline.appendEvent({ kind: "tool_call", id: "tc4", name: "Read", input: { path: "d" } });
    pipeline.appendEvent({ kind: "tool_call", id: "tc5", name: "Read", input: { path: "e" } });

    const clusterEl2 = scroller.querySelector(".te-cluster") as HTMLElement & { _group: any; _body: HTMLElement };
    expect(clusterEl2).toBe(clusterEl1);
    const body = clusterEl2._body;

    expect(body.querySelectorAll(".te-tool-call")).toHaveLength(5);
    expect(body.hidden).toBe(true);

    group.expanded = true;
    body.hidden = false;

    expect(body.querySelectorAll(".te-tool-call")).toHaveLength(5);
  });
});

describe("assistant_text coalescing", () => {
  it("consecutive assistant_text deltas produce a single coalesced event when a non-assistant event arrives", () => {
    const scroller = makeScroller();
    const pipeline = createTranscriptPipeline(scroller);

    pipeline.appendEvent({ kind: "assistant_text", text: "a" });
    pipeline.appendEvent({ kind: "assistant_text", text: "b" });
    pipeline.appendEvent({ kind: "assistant_text", text: "c" });
    pipeline.appendEvent({ kind: "tool_call", id: "tc1", name: "Bash", input: { cmd: "ls" } });

    const assistantRows = scroller.querySelectorAll(".te-assistant-text");
    const toolCallRows = scroller.querySelectorAll(".te-tool-call");

    expect(assistantRows).toHaveLength(1);
    expect(toolCallRows).toHaveLength(1);

    const firstRow = assistantRows.item(0) as HTMLElement;
    const content = firstRow.querySelector(".te-content");
    expect(content).not.toBeNull();
    expect(content!.textContent).toContain("a");
    expect(content!.textContent).toContain("b");
    expect(content!.textContent).toContain("c");
  });
});
