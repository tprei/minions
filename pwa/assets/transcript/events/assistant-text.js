import { marked } from "/assets/vendor/marked.esm.js";
import DOMPurify from "/assets/vendor/dompurify.esm.js";

marked.setOptions({ breaks: true });

export function render(event) {
  const el = document.createElement("div");
  el.className = "te te-assistant-text";

  const content = document.createElement("div");
  content.className = "te-content te-markdown";
  const raw = marked.parse(event.text ?? "");
  content.innerHTML = DOMPurify.sanitize(raw);

  el.appendChild(content);
  return el;
}
