function formatDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) return "";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (isNaN(ms) || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function createRunsPanel({ task }) {
  const el = document.createElement("div");
  el.className = "runs-panel";

  const runs = task.runs ?? [];

  if (runs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "runs-empty";
    empty.textContent = "No runs yet.";
    el.appendChild(empty);
    return { element: el };
  }

  const isCollapsedDefault = runs.length > 1;

  const header = document.createElement("button");
  header.className = "runs-toggle";

  const chevron = document.createElement("span");
  chevron.className = "runs-chevron";
  chevron.textContent = isCollapsedDefault ? "▾" : "▴";

  const label = document.createElement("span");
  label.textContent = `Runs (${runs.length})`;

  header.appendChild(chevron);
  header.appendChild(label);
  el.appendChild(header);

  const list = document.createElement("div");
  list.className = "runs-list";
  list.style.display = isCollapsedDefault ? "none" : "";

  for (const run of runs) {
    const row = document.createElement("div");
    row.className = "run-row";

    const attempt = document.createElement("span");
    attempt.className = "run-attempt";
    attempt.textContent = `#${run.attempt + 1}`;
    row.appendChild(attempt);

    if (run.terminalReason) {
      const reason = document.createElement("span");
      reason.className = "run-reason";
      reason.textContent = run.terminalReason;
      row.appendChild(reason);
    }

    const duration = formatDuration(run.startedAt, run.endedAt);
    if (duration) {
      const dur = document.createElement("span");
      dur.className = "run-duration";
      dur.textContent = duration;
      row.appendChild(dur);
    }

    const restoreBtn = document.createElement("button");
    restoreBtn.className = "run-restore-btn";
    restoreBtn.textContent = "Restore";
    restoreBtn.disabled = true;
    restoreBtn.title = "Restore TBD — engine command pending";

    const restoreHelper = document.createElement("span");
    restoreHelper.className = "run-restore-helper";
    restoreHelper.textContent = "Restore TBD";

    row.appendChild(restoreBtn);
    row.appendChild(restoreHelper);
    list.appendChild(row);
  }

  el.appendChild(list);

  header.addEventListener("click", () => {
    const collapsed = list.style.display === "none";
    list.style.display = collapsed ? "" : "none";
    chevron.textContent = collapsed ? "▴" : "▾";
  });

  return { element: el };
}
