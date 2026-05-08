export function render(event) {
  const el = document.createElement("div");
  el.className = "te te-error";

  const msg = document.createElement("div");
  msg.className = "te-error-message";
  msg.textContent = event.message ?? "Unknown error";

  el.appendChild(msg);

  if (event.stack) {
    const stackToggle = document.createElement("button");
    stackToggle.className = "te-error-stack-toggle";
    stackToggle.type = "button";
    stackToggle.setAttribute("aria-expanded", "false");
    stackToggle.textContent = "Show stack trace";

    const stack = document.createElement("pre");
    stack.className = "te-error-stack";
    stack.hidden = true;
    stack.textContent = event.stack;

    stackToggle.addEventListener("click", () => {
      const expanded = stackToggle.getAttribute("aria-expanded") === "true";
      const next = !expanded;
      stackToggle.setAttribute("aria-expanded", String(next));
      stack.hidden = !next;
      stackToggle.textContent = next ? "Hide stack trace" : "Show stack trace";
    });

    el.appendChild(stackToggle);
    el.appendChild(stack);
  }

  return el;
}
