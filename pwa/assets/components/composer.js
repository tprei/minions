import { useDraftState } from "../hooks/use-draft-state.js";

const CLOCK_SVG = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/>
  <path d="M7 4v3l2 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const MODE_CONFIG = {
  idle:     { label: "Send",         icon: null,      hint: null,                                                                                               submitDisabled: false },
  running:  { label: "Queue",        icon: CLOCK_SVG, hint: "Queued for AI", hintSub: "Awaiting completion before queuing follow-ups.", submitDisabled: true   },
  feedback: { label: "Submit",       icon: null,      hint: null,                                                                                               submitDisabled: false },
  disabled: { label: "Send",         icon: null,      hint: null,                                                                                               submitDisabled: true  },
  approval: { label: "Send",         icon: null,      hint: "Approval mode — A to approve, D to deny",                                                         submitDisabled: true  },
};

export function createComposer({ mode: initialMode, taskId, workflowId, onSubmit }) {
  const draft = useDraftState(taskId, workflowId);

  const root = document.createElement("div");
  root.className = "composer";

  const textarea = document.createElement("textarea");
  textarea.className = "composer-textarea";
  textarea.placeholder = "Message…";
  textarea.value = draft.value;

  const inputHandlers = new Set();
  let approvalHandlers = null;

  textarea.addEventListener("input", () => {
    draft.setValue(textarea.value);
    for (const h of inputHandlers) h(textarea.value);
  });

  textarea.addEventListener("keydown", (e) => {
    if (currentMode !== "approval") return;
    if (textarea.value.trim() !== "") return;
    if (e.key === "a" || e.key === "A") {
      e.preventDefault();
      if (approvalHandlers) approvalHandlers.onApprove();
    } else if (e.key === "d" || e.key === "D") {
      e.preventDefault();
      if (approvalHandlers) approvalHandlers.onDeny();
    }
  });

  const attachmentPill = document.createElement("div");
  attachmentPill.className = "composer-attachment-pill";
  attachmentPill.dataset.testid = "composer-attachment-pill";
  attachmentPill.style.display = "none";

  const pillLabel = document.createElement("span");
  pillLabel.className = "composer-attachment-pill-label";
  attachmentPill.appendChild(pillLabel);

  const pillList = document.createElement("ul");
  pillList.className = "composer-attachment-list";
  pillList.style.display = "none";
  pillList.dataset.testid = "composer-attachment-list";
  attachmentPill.appendChild(pillList);

  const footer = document.createElement("div");
  footer.className = "composer-footer";

  const hintWrap = document.createElement("div");
  hintWrap.className = "composer-hint";

  const hintPrimary = document.createElement("span");
  hintPrimary.className = "composer-hint-primary";

  const hintSecondary = document.createElement("span");
  hintSecondary.className = "composer-hint-secondary";

  hintWrap.appendChild(hintPrimary);
  hintWrap.appendChild(hintSecondary);

  const btn = document.createElement("button");
  btn.className = "composer-btn";

  footer.appendChild(hintWrap);
  footer.appendChild(btn);
  root.appendChild(attachmentPill);
  root.appendChild(textarea);
  root.appendChild(footer);

  let currentMode = initialMode ?? "idle";
  let queuedAttachments = [];
  const commentJumpListeners = new Set();

  let pillExpanded = false;

  pillLabel.addEventListener("click", () => {
    pillExpanded = !pillExpanded;
    pillList.style.display = pillExpanded ? "" : "none";
  });

  function renderAttachmentPill() {
    if (queuedAttachments.length === 0) {
      attachmentPill.style.display = "none";
      pillList.innerHTML = "";
      pillList.style.display = "none";
      pillExpanded = false;
      return;
    }

    pillLabel.textContent = `Queued for AI · ${queuedAttachments.length} comment${queuedAttachments.length === 1 ? "" : "s"}`;
    attachmentPill.style.display = "";

    pillList.innerHTML = "";
    for (const att of queuedAttachments) {
      const li = document.createElement("li");
      li.className = "composer-attachment-item";
      li.dataset.testid = "composer-attachment-item";
      li.textContent = `${att.path}:${att.line} — ${att.body}`;
      li.addEventListener("click", () => {
        for (const cb of commentJumpListeners) cb(att);
      });
      pillList.appendChild(li);
    }
  }

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
      hintPrimary.textContent = cfg.hint;
      hintSecondary.textContent = cfg.hintSub ?? "";
      hintSecondary.style.display = cfg.hintSub ? "" : "none";
      hintWrap.style.display = "";
    } else {
      hintPrimary.textContent = "";
      hintSecondary.textContent = "";
      hintWrap.style.display = "none";
    }

    const submitDisabled = cfg.submitDisabled;
    const textareaDisabled = m === "disabled";
    btn.disabled = submitDisabled;
    textarea.disabled = textareaDisabled;
    btn.classList.toggle("composer-btn-disabled", submitDisabled);
  }

  applyMode(currentMode);

  btn.addEventListener("click", () => {
    const cfg = MODE_CONFIG[currentMode] ?? MODE_CONFIG.idle;
    if (cfg.submitDisabled) return;
    const val = textarea.value.trim();
    if (!val) return;
    const attachments = queuedAttachments.length > 0 ? [...queuedAttachments] : undefined;
    onSubmit?.(val, currentMode, attachments);
    draft.clear();
    textarea.value = "";
    queuedAttachments = [];
    renderAttachmentPill();
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
      for (const h of inputHandlers) h(v);
    },
    onInput(handler) {
      inputHandlers.add(handler);
      return () => inputHandlers.delete(handler);
    },
    setApprovalHandlers(handlers) {
      approvalHandlers = handlers;
    },
    setAttachments(attachments) {
      queuedAttachments = attachments ? [...attachments] : [];
      renderAttachmentPill();
    },
    getAttachments() {
      return [...queuedAttachments];
    },
    onCommentJump(cb) {
      commentJumpListeners.add(cb);
      return () => commentJumpListeners.delete(cb);
    },
  };
}
