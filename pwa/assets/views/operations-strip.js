import { marked } from "/assets/vendor/marked.esm.js";
import DOMPurify from "/assets/vendor/dompurify.esm.js";

marked.setOptions({ breaks: true });

const KIND_LABEL = {
  restack: "Restack",
};

function kindLabel(kind) {
  return KIND_LABEL[kind] ?? kind;
}

function renderMarkdown(text) {
  if (!text) return null;
  const raw = marked.parse(text);
  const safe = DOMPurify.sanitize(raw);
  const el = document.createElement("div");
  el.className = "op-explainer";
  el.innerHTML = safe;
  return el;
}

function buildOpCard(op, workflowId, onTaskFocus) {
  const card = document.createElement("div");
  card.className = "op-card";
  card.dataset.opId = op.id;

  const topRow = document.createElement("div");
  topRow.className = "op-card-top";

  const badge = document.createElement("span");
  badge.className = "op-kind-badge";
  badge.textContent = kindLabel(op.kind);
  topRow.appendChild(badge);

  const statusPill = document.createElement("span");
  statusPill.className = `op-status-pill op-status-${op.status}`;
  statusPill.textContent = op.status;
  topRow.appendChild(statusPill);

  const closeBtn = document.createElement("button");
  closeBtn.className = "op-card-close-btn";
  closeBtn.setAttribute("aria-label", "Dismiss");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => {
    card.style.display = "none";
  });
  topRow.appendChild(closeBtn);

  card.appendChild(topRow);

  if (op.affectedNodeIds && op.affectedNodeIds.length > 0) {
    const chipsRow = document.createElement("div");
    chipsRow.className = "op-affected-chips";
    for (const taskId of op.affectedNodeIds) {
      const chip = document.createElement("button");
      chip.className = "op-task-chip";
      chip.textContent = taskId;
      chip.addEventListener("click", () => {
        if (typeof onTaskFocus === "function") onTaskFocus(taskId);
      });
      chipsRow.appendChild(chip);
    }
    card.appendChild(chipsRow);
  }

  if (op.error) {
    const explainerEl = renderMarkdown(op.error);
    if (explainerEl) card.appendChild(explainerEl);
  }

  const footer = document.createElement("div");
  footer.className = "op-card-footer";

  const resolveBtn = document.createElement("button");
  resolveBtn.className = "op-resolve-btn";
  resolveBtn.textContent = "Resolve";

  const canResolve = op.kind === "restack" && op.fromBase != null && op.status === "conflict";

  if (canResolve) {
    resolveBtn.disabled = false;
    resolveBtn.addEventListener("click", () => {
      const body = {
        kind: "request-restack",
        workflowId,
        input: {
          operationId: op.id,
          ancestorId: op.fromBase,
          idempotencyKey: op.idempotencyKey,
          now: new Date().toISOString(),
        },
      };
      resolveBtn.disabled = true;
      fetch("/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then((res) => {
          if (!res.ok) resolveBtn.disabled = false;
        })
        .catch(() => {
          resolveBtn.disabled = false;
        });
    });
  } else {
    resolveBtn.disabled = true;
    const helper = document.createElement("span");
    helper.className = "op-resolve-helper";
    helper.textContent =
      op.status === "conflict"
        ? "Resolve flow pending engine command"
        : "No action available in current state";
    footer.appendChild(helper);
  }

  footer.appendChild(resolveBtn);
  card.appendChild(footer);

  return card;
}

export function createOperationsStrip({ workflow, deps }) {
  const root = document.createElement("div");
  root.className = "operations-strip";

  const onTaskFocus = deps?.onTaskFocus ?? null;
  let currentWorkflow = workflow;

  function renderOps(wf) {
    root.innerHTML = "";
    const ops = Object.values(wf.operations ?? {});
    const activeOps = ops.filter(
      (op) => op.status !== "completed",
    );

    if (activeOps.length === 0) {
      root.style.display = "none";
      return;
    }

    root.style.display = "";

    for (const op of activeOps) {
      const card = buildOpCard(op, wf.id, onTaskFocus);
      root.appendChild(card);
    }
  }

  renderOps(currentWorkflow);

  function update(newWorkflow) {
    currentWorkflow = newWorkflow;
    renderOps(currentWorkflow);
  }

  function onGraphOperationChanged(event) {
    const payload = event.payload ?? event;
    if (!payload || payload.workflowId !== currentWorkflow?.id) return;
    fetch(`/workflows/${currentWorkflow.id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((wf) => {
        currentWorkflow = wf;
        renderOps(currentWorkflow);
      })
      .catch(() => {});
  }

  function destroy() {
    root.remove();
  }

  return { element: root, update, onGraphOperationChanged, destroy };
}
