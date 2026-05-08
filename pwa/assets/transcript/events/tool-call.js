import { createStatusDot } from "/assets/components/status-dot.js";

export function render(event, ctx) {
  const el = document.createElement("div");
  el.className = "te te-tool-call";
  el.dataset.toolCallId = event.id ?? "";

  const header = document.createElement("div");
  header.className = "te-tool-call-header";

  const dot = createStatusDot("running", { size: "sm" });
  dot.className += " te-tool-status-dot";

  const name = document.createElement("span");
  name.className = "te-tool-name";
  name.textContent = event.name ?? "tool";

  const inputPreview = document.createElement("span");
  inputPreview.className = "te-tool-input-preview";
  const inputStr = JSON.stringify(event.input ?? {});
  inputPreview.textContent = inputStr.length > 60 ? inputStr.slice(0, 60) + "…" : inputStr;

  const expandBtn = document.createElement("button");
  expandBtn.className = "te-tool-expand-btn";
  expandBtn.type = "button";
  expandBtn.setAttribute("aria-expanded", "false");
  expandBtn.textContent = "▶";

  header.appendChild(dot);
  header.appendChild(name);
  header.appendChild(inputPreview);
  header.appendChild(expandBtn);

  const details = document.createElement("div");
  details.className = "te-tool-details";
  details.hidden = true;

  const inputPre = document.createElement("pre");
  inputPre.className = "te-tool-input-full";
  inputPre.textContent = JSON.stringify(event.input ?? {}, null, 2);

  details.appendChild(inputPre);

  expandBtn.addEventListener("click", () => {
    const expanded = expandBtn.getAttribute("aria-expanded") === "true";
    const next = !expanded;
    expandBtn.setAttribute("aria-expanded", String(next));
    details.hidden = !next;
    expandBtn.textContent = next ? "▼" : "▶";

    if (ctx?.group?.setExpanded) {
      ctx.group.setExpanded(next);
    }
  });

  el.__setStatus = function (status) {
    dot.remove();
    const newDot = createStatusDot(status, { size: "sm" });
    newDot.className += " te-tool-status-dot";
    header.insertBefore(newDot, header.firstChild);
  };

  el.__setExpanded = function (expanded) {
    expandBtn.setAttribute("aria-expanded", String(expanded));
    details.hidden = !expanded;
    expandBtn.textContent = expanded ? "▼" : "▶";
  };

  el.appendChild(header);
  el.appendChild(details);
  return el;
}
