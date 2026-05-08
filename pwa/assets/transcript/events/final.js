export function render(event) {
  const el = document.createElement("div");
  el.className = "te te-final";

  const label = document.createElement("div");
  label.className = "te-final-label";
  label.textContent = "Session complete";

  const ref = document.createElement("div");
  ref.className = "te-final-ref";
  ref.textContent = event.sessionRef ?? "";

  el.appendChild(label);
  el.appendChild(ref);

  if (event.exitMetadata && Object.keys(event.exitMetadata).length > 0) {
    const meta = document.createElement("pre");
    meta.className = "te-final-meta";
    meta.textContent = JSON.stringify(event.exitMetadata, null, 2);
    el.appendChild(meta);
  }

  return el;
}
