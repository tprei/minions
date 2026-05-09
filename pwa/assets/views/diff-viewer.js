function buildLineSpan(line) {
  const span = document.createElement("span");
  span.className = "diff-line";
  if (line.startsWith("+") && !line.startsWith("+++")) {
    span.classList.add("diff-add");
  } else if (line.startsWith("-") && !line.startsWith("---")) {
    span.classList.add("diff-del");
  }
  span.textContent = line + "\n";
  return span;
}

function renderPatch(patch) {
  const pre = document.createElement("pre");
  pre.className = "diff-patch";
  if (!patch) {
    pre.textContent = "(no patch)";
    return pre;
  }
  for (const line of patch.split("\n")) {
    pre.appendChild(buildLineSpan(line));
  }
  return pre;
}

export function createDiffViewer({ prDetail, files }) {
  const root = document.createElement("div");
  root.className = "diff-viewer";

  const mq = window.matchMedia("(min-width: 768px)");
  let sideBySide = mq.matches;

  const fileList = files ?? prDetail.files ?? [];

  const tree = document.createElement("div");
  tree.className = "diff-tree";

  const pane = document.createElement("div");
  pane.className = "diff-pane";

  root.appendChild(tree);
  root.appendChild(pane);

  let selectedRange = null;
  let currentFile = null;
  const comments = [];
  const sendListeners = new Set();

  function applyLayout() {
    if (sideBySide) {
      root.classList.add("diff-viewer-side-by-side");
      root.classList.remove("diff-viewer-unified");
    } else {
      root.classList.add("diff-viewer-unified");
      root.classList.remove("diff-viewer-side-by-side");
    }
  }

  function getFilePath(file) {
    return file.filename ?? file.name ?? "";
  }

  function renderChips(lines) {
    lines.forEach((lineEl, idx) => {
      const existing = lineEl.querySelector(".diff-comment-chip");
      if (existing) existing.remove();
    });

    const path = getFilePath(currentFile);
    for (const c of comments) {
      if (c.path !== path) continue;
      const lineEl = lines[c.line];
      if (!lineEl) continue;
      const chip = document.createElement("span");
      chip.className = "diff-comment-chip";
      chip.dataset.commentId = String(c.id);
      chip.textContent = "💬";
      chip.title = c.body;
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        openCommentEditor(c.id, lines);
      });
      lineEl.appendChild(chip);
    }
  }

  function renderSendButton() {
    const existing = root.querySelector(".diff-send-btn");
    if (existing) existing.remove();

    if (comments.length === 0) return;

    const btn = document.createElement("button");
    btn.className = "diff-send-btn";
    btn.dataset.testid = "diff-send-btn";
    btn.textContent = `Send to agent (${comments.length})`;
    btn.addEventListener("click", () => {
      const payload = comments.map(({ kind, path, line, body }) => ({ kind, path, line, body }));
      for (const cb of sendListeners) cb(payload);
    });
    root.appendChild(btn);
  }

  function buildAddCommentButton(lines) {
    const existing = pane.querySelector(".diff-add-comment-btn");
    if (existing) existing.remove();
    const existingForm = pane.querySelector(".diff-comment-form");
    if (existingForm) existingForm.remove();

    if (!selectedRange) return;

    const { start, end } = selectedRange;
    const anchorLine = lines[end];
    if (!anchorLine) return;

    const btn = document.createElement("button");
    btn.className = "diff-add-comment-btn";
    btn.dataset.testid = "diff-add-comment-btn";
    btn.textContent = "Add comment";
    anchorLine.appendChild(btn);

    btn.addEventListener("click", () => {
      btn.remove();
      openNewCommentForm(lines);
    });
  }

  function openNewCommentForm(lines) {
    const existingForm = pane.querySelector(".diff-comment-form");
    if (existingForm) existingForm.remove();

    if (!selectedRange) return;
    const { start, end } = selectedRange;
    const anchorLine = lines[end];
    if (!anchorLine) return;

    const form = buildCommentForm({
      initialBody: "",
      onSave(body) {
        const rangeLabel = start === end ? "" : `Lines ${start}-${end}: `;
        const fullBody = rangeLabel ? `${rangeLabel}${body}` : body;
        const id = Date.now();
        comments.push({ kind: "comment", path: getFilePath(currentFile), line: start, body: fullBody, id });
        form.remove();
        renderChips(lines);
        renderSendButton();
      },
      onCancel() {
        form.remove();
      },
    });

    anchorLine.insertAdjacentElement("afterend", form);
  }

  function openCommentEditor(commentId, lines) {
    const existingForm = pane.querySelector(".diff-comment-form");
    if (existingForm) existingForm.remove();

    const idx = comments.findIndex((c) => c.id === commentId);
    if (idx === -1) return;
    const c = comments[idx];
    const anchorLine = lines[c.line];
    if (!anchorLine) return;

    const form = buildCommentForm({
      initialBody: c.body,
      onSave(body) {
        comments[idx] = { ...c, body };
        form.remove();
        renderChips(lines);
        renderSendButton();
      },
      onDelete() {
        comments.splice(idx, 1);
        form.remove();
        renderChips(lines);
        renderSendButton();
      },
      onCancel() {
        form.remove();
      },
    });

    anchorLine.insertAdjacentElement("afterend", form);
  }

  function buildCommentForm({ initialBody, onSave, onDelete, onCancel }) {
    const form = document.createElement("div");
    form.className = "diff-comment-form";
    form.dataset.testid = "diff-comment-form";

    const textarea = document.createElement("textarea");
    textarea.className = "diff-comment-textarea";
    textarea.dataset.testid = "diff-comment-textarea";
    textarea.value = initialBody;
    textarea.placeholder = "Add a comment…";
    form.appendChild(textarea);

    const actions = document.createElement("div");
    actions.className = "diff-comment-actions";

    const saveBtn = document.createElement("button");
    saveBtn.className = "diff-comment-save-btn";
    saveBtn.dataset.testid = "diff-comment-save";
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", () => {
      const body = textarea.value.trim();
      if (!body) {
        textarea.focus();
        return;
      }
      onSave(body);
    });
    actions.appendChild(saveBtn);

    if (onDelete) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "diff-comment-delete-btn";
      deleteBtn.dataset.testid = "diff-comment-delete";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => onDelete());
      actions.appendChild(deleteBtn);
    }

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "diff-comment-cancel-btn";
    cancelBtn.dataset.testid = "diff-comment-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => onCancel());
    actions.appendChild(cancelBtn);

    form.appendChild(actions);
    return form;
  }

  function renderFile(file) {
    pane.innerHTML = "";
    selectedRange = null;
    currentFile = file;

    const existing = root.querySelector(".diff-send-btn");
    if (existing) existing.remove();

    const filename = document.createElement("div");
    filename.className = "diff-filename";
    filename.textContent = file.filename ?? file.name ?? "";
    pane.appendChild(filename);

    const patch = file.patch ?? file.diff ?? null;
    if (!patch) {
      const noChange = document.createElement("div");
      noChange.className = "diff-no-change";
      noChange.textContent = "(no diff)";
      pane.appendChild(noChange);
      return;
    }

    const pre = renderPatch(patch);
    pane.appendChild(pre);

    const lines = pre.querySelectorAll(".diff-line");
    let dragStart = null;
    let pendingMouseUpCleanup = null;

    function registerMouseUp() {
      if (pendingMouseUpCleanup) pendingMouseUpCleanup();
      function handler() {
        pendingMouseUpCleanup = null;
        if (selectedRange) {
          buildAddCommentButton(lines);
        }
      }
      document.addEventListener("mouseup", handler, { once: true });
      pendingMouseUpCleanup = () => document.removeEventListener("mouseup", handler);
    }

    lines.forEach((lineEl, idx) => {
      lineEl.dataset.lineIndex = String(idx);
      lineEl.addEventListener("mousedown", (e) => {
        if ((e.target instanceof Element) && e.target.closest(".diff-add-comment-btn, .diff-comment-chip, .diff-comment-form")) {
          return;
        }
        dragStart = idx;
        selectedRange = { start: idx, end: idx };
        updateLineSelection(lines, selectedRange);
        registerMouseUp();
      });
      lineEl.addEventListener("mouseover", () => {
        if (dragStart === null) return;
        const start = Math.min(dragStart, idx);
        const end = Math.max(dragStart, idx);
        selectedRange = { start, end };
        updateLineSelection(lines, selectedRange);
      });
    });

    renderChips(lines);
    renderSendButton();
  }

  function updateLineSelection(lines, range) {
    lines.forEach((lineEl, idx) => {
      if (idx >= range.start && idx <= range.end) {
        lineEl.classList.add("diff-line-selected");
      } else {
        lineEl.classList.remove("diff-line-selected");
      }
    });
  }

  function buildTree() {
    tree.innerHTML = "";
    if (fileList.length === 0) {
      const empty = document.createElement("div");
      empty.className = "diff-tree-empty";
      empty.textContent = "No files";
      tree.appendChild(empty);
      return;
    }
    for (const file of fileList) {
      const item = document.createElement("div");
      item.className = "diff-tree-item";
      item.textContent = file.filename ?? file.name ?? "unknown";
      item.addEventListener("click", () => {
        tree.querySelectorAll(".diff-tree-item").forEach((el) => el.classList.remove("diff-tree-item-active"));
        item.classList.add("diff-tree-item-active");
        renderFile(file);
      });
      tree.appendChild(item);
    }
    if (fileList.length > 0) {
      tree.querySelector(".diff-tree-item")?.classList.add("diff-tree-item-active");
      renderFile(fileList[0]);
    }
  }

  function onMqChange(e) {
    sideBySide = e.matches;
    applyLayout();
  }

  mq.addEventListener("change", onMqChange);
  applyLayout();
  buildTree();

  function getSelectedRange() {
    return selectedRange;
  }

  function getComments() {
    return comments.map(({ kind, path, line, body }) => ({ kind, path, line, body }));
  }

  function onSend(cb) {
    sendListeners.add(cb);
    return () => sendListeners.delete(cb);
  }

  function destroy() {
    mq.removeEventListener("change", onMqChange);
    root.remove();
  }

  return { element: root, destroy, getSelectedRange, getComments, onSend };
}
