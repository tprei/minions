import { useDraftState } from "../hooks/use-draft-state.js";

const CLOCK_SVG = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/>
  <path d="M7 4v3l2 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const MODE_CONFIG = {
  idle:     { label: "Send",         icon: null,      hint: null },
  running:  { label: "Queue",        icon: CLOCK_SVG, hint: "Queued for AI" },
  feedback: { label: "Submit",        icon: null,      hint: null },
  disabled: { label: "Send",         icon: null,      hint: null },
};

export function createComposer({ mode: initialMode, taskId, workflowId, onSubmit }) {
  const draft = useDraftState(taskId, workflowId);

  const root = document.createElement("div");
  root.className = "composer";

  const textarea = document.createElement("textarea");
  textarea.className = "composer-textarea";
  textarea.placeholder = "Message…";
  textarea.value = draft.value;

  textarea.addEventListener("input", () => {
    draft.setValue(textarea.value);
  });

  const footer = document.createElement("div");
  footer.className = "composer-footer";

  const hint = document.createElement("span");
  hint.className = "composer-hint";

  const btn = document.createElement("button");
  btn.className = "composer-btn";

  footer.appendChild(hint);
  footer.appendChild(btn);
  root.appendChild(textarea);
  root.appendChild(footer);

  let currentMode = initialMode ?? "idle";

  function applyMode(m) {
    currentMode = m;
    const cfg = MODE_CONFIG[m] ?? MODE_CONFIG.idle;

    btn.innerHTML = "";
    if (cfg.icon) {
      const iconSpan = document.createElement("span");
      iconSpan.className = "composer-btn-icon";
      iconSpan.innerHTML = cfg.icon;
      btn.appendChild(iconSpan);
    }
    btn.appendChild(document.createTextNode(cfg.label));
    btn.dataset.mode = m;

    if (cfg.hint) {
      hint.textContent = cfg.hint;
      hint.style.display = "";
    } else {
      hint.textContent = "";
      hint.style.display = "none";
    }

    const disabled = m === "disabled";
    btn.disabled = disabled;
    textarea.disabled = disabled;
    btn.classList.toggle("composer-btn-disabled", disabled);
  }

  applyMode(currentMode);

  btn.addEventListener("click", () => {
    if (currentMode === "disabled") return;
    const val = textarea.value.trim();
    if (!val) return;
    onSubmit?.(val, currentMode);
    draft.clear();
    textarea.value = "";
  });

  draft.subscribe((v) => {
    if (textarea.value !== v) textarea.value = v;
  });

  return {
    element: root,
    setMode(m) { applyMode(m); },
    getValue() { return textarea.value; },
    setValue(v) {
      textarea.value = v;
      draft.setValue(v);
    },
  };
}
