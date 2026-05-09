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

  function applyLayout() {
    if (sideBySide) {
      root.classList.add("diff-viewer-side-by-side");
      root.classList.remove("diff-viewer-unified");
    } else {
      root.classList.add("diff-viewer-unified");
      root.classList.remove("diff-viewer-side-by-side");
    }
  }

  function renderFile(file) {
    pane.innerHTML = "";
    selectedRange = null;

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

    lines.forEach((lineEl, idx) => {
      lineEl.dataset.lineIndex = String(idx);
      lineEl.addEventListener("mousedown", () => {
        dragStart = idx;
        selectedRange = { start: idx, end: idx };
        updateLineSelection(lines, selectedRange);
      });
      lineEl.addEventListener("mouseover", () => {
        if (dragStart === null) return;
        const start = Math.min(dragStart, idx);
        const end = Math.max(dragStart, idx);
        selectedRange = { start, end };
        updateLineSelection(lines, selectedRange);
      });
    });

    document.addEventListener("mouseup", onMouseUp, { once: true });
  }

  function onMouseUp() {
    // drag ends — selectedRange stays set for UI-8.5 comment composer
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

  function destroy() {
    mq.removeEventListener("change", onMqChange);
    root.remove();
  }

  return { element: root, destroy, getSelectedRange };
}
