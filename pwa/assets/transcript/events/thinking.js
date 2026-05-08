export function render(event) {
  const el = document.createElement("div");
  el.className = "te te-thinking";

  const header = document.createElement("button");
  header.className = "te-thinking-toggle";
  header.setAttribute("aria-expanded", "false");
  header.type = "button";

  const chevron = document.createElement("span");
  chevron.className = "te-thinking-chevron";
  chevron.textContent = "▶";
  chevron.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "te-thinking-label";
  label.textContent = "Thinking…";

  header.appendChild(chevron);
  header.appendChild(label);

  const body = document.createElement("div");
  body.className = "te-thinking-body";
  body.hidden = true;

  const pre = document.createElement("pre");
  pre.className = "te-thinking-text";
  pre.textContent = event.text ?? "";

  body.appendChild(pre);

  header.addEventListener("click", () => {
    const expanded = header.getAttribute("aria-expanded") === "true";
    const next = !expanded;
    header.setAttribute("aria-expanded", String(next));
    body.hidden = !next;
    chevron.textContent = next ? "▼" : "▶";
  });

  el.appendChild(header);
  el.appendChild(body);
  return el;
}
