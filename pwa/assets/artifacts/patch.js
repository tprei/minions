export function render(artifact) {
  const wrap = document.createElement("div");
  wrap.className = "artifact-patch";

  const toggle = document.createElement("button");
  toggle.className = "artifact-patch-toggle";
  toggle.textContent = "Patch ▾";

  const pre = document.createElement("pre");
  pre.className = "artifact-patch-pre";
  pre.style.display = "none";

  const lines = artifact.ref.split("\n");
  for (const line of lines) {
    const span = document.createElement("span");
    span.className = "patch-line";
    if (line.startsWith("+") && !line.startsWith("+++")) {
      span.classList.add("patch-add");
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      span.classList.add("patch-del");
    }
    span.textContent = line + "\n";
    pre.appendChild(span);
  }

  toggle.addEventListener("click", () => {
    const expanded = pre.style.display !== "none";
    pre.style.display = expanded ? "none" : "block";
    toggle.textContent = expanded ? "Patch ▾" : "Patch ▴";
  });

  wrap.appendChild(toggle);
  wrap.appendChild(pre);
  return wrap;
}
