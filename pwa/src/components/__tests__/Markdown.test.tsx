import { describe, it, expect } from "vitest";
import { Marked } from "marked";
import DOMPurify from "dompurify";

const marked = new Marked({ gfm: true, breaks: false });

function renderMarkdown(source: string): string {
  const raw = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}

describe("Markdown DOMPurify sanitization", () => {
  it("strips <script> tags from rendered output", () => {
    const html = renderMarkdown('Hello <script>alert("xss")</script> World');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("alert(");
  });

  it("strips onerror event handlers", () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
  });

  it("preserves bold markdown", () => {
    const html = renderMarkdown("**bold**");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("preserves inline code", () => {
    const html = renderMarkdown("`code`");
    expect(html).toContain("<code>");
  });

  it("preserves fenced code blocks", () => {
    const html = renderMarkdown("```\nconst x = 1;\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("<code>");
  });
});
