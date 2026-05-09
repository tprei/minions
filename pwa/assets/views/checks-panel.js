const POLL_FAST_MS = 30000;
const POLL_SLOW_MS = 120000;

function statusDotClass(status) {
  if (status === "success") return "check-dot-success";
  if (status === "failure") return "check-dot-failure";
  if (status === "pending") return "check-dot-pending";
  if (status === "skipped") return "check-dot-skipped";
  return "check-dot-unknown";
}

function formatDuration(startedAt, completedAt) {
  if (!startedAt) return "";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (isNaN(start)) return "";
  const diffS = Math.round((end - start) / 1000);
  if (diffS < 60) return `${diffS}s`;
  return `${Math.floor(diffS / 60)}m ${diffS % 60}s`;
}

function normalizeChecks(prDetail) {
  const checks = prDetail.check_runs ?? prDetail.checks ?? [];
  return checks.map((c) => ({
    id: c.id ?? c.name,
    name: c.name,
    status: c.conclusion ?? c.status ?? "pending",
    startedAt: c.started_at ?? c.startedAt ?? null,
    completedAt: c.completed_at ?? c.completedAt ?? null,
    htmlUrl: c.html_url ?? c.htmlUrl ?? null,
  }));
}

function checksFingerprint(checks) {
  return checks.map((c) => `${c.id}:${c.status}`).join("|");
}

export function createChecksPanel({ prDetail, githubProxy }) {
  const root = document.createElement("div");
  root.className = "checks-panel";

  const list = document.createElement("div");
  list.className = "checks-list";
  root.appendChild(list);

  let currentChecks = normalizeChecks(prDetail);
  let lastFingerprint = checksFingerprint(currentChecks);
  let pollInterval = POLL_FAST_MS;
  let timerId = null;
  let destroyed = false;

  renderList(currentChecks);

  function renderList(checks) {
    list.innerHTML = "";
    if (checks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "checks-empty";
      empty.textContent = "No checks";
      list.appendChild(empty);
      return;
    }
    for (const check of checks) {
      list.appendChild(buildRow(check));
    }
  }

  function buildRow(check) {
    const row = document.createElement("div");
    row.className = "check-row";

    const dot = document.createElement("span");
    dot.className = `check-dot ${statusDotClass(check.status)}`;
    row.appendChild(dot);

    const name = document.createElement("span");
    name.className = "check-name";
    name.textContent = check.name ?? "";
    row.appendChild(name);

    const duration = formatDuration(check.startedAt, check.completedAt);
    if (duration) {
      const dur = document.createElement("span");
      dur.className = "check-duration";
      dur.textContent = duration;
      row.appendChild(dur);
    }

    if (check.htmlUrl) {
      const link = document.createElement("a");
      link.className = "check-logs-link";
      link.href = check.htmlUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "View logs";
      row.appendChild(link);
    }

    return row;
  }

  function fetchAndUpdate() {
    if (destroyed) return;
    if (!prDetail.check_runs_url && !prDetail.checks_url && !githubProxy) return;

    const checksUrl = prDetail.check_runs_url ?? prDetail.checks_url;
    if (!checksUrl) return;

    const proxyUrl = `${githubProxy}?url=${encodeURIComponent(checksUrl)}`;
    fetch(proxyUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (destroyed) return;
        const newChecks = normalizeChecks(data);
        const newFingerprint = checksFingerprint(newChecks);
        if (newFingerprint !== lastFingerprint) {
          pollInterval = POLL_FAST_MS;
          lastFingerprint = newFingerprint;
          currentChecks = newChecks;
          renderList(currentChecks);
        } else {
          pollInterval = POLL_SLOW_MS;
        }
        schedulePoll();
      })
      .catch(() => {
        if (!destroyed) schedulePoll();
      });
  }

  function schedulePoll() {
    if (destroyed) return;
    if (timerId !== null) clearInterval(timerId);
    timerId = setInterval(() => {
      if (document.hidden) return;
      fetchAndUpdate();
    }, pollInterval);
  }

  function onVisibilityChange() {
    if (!document.hidden) {
      fetchAndUpdate();
    }
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
  schedulePoll();

  function refresh() {
    fetchAndUpdate();
  }

  function destroy() {
    destroyed = true;
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
    document.removeEventListener("visibilitychange", onVisibilityChange);
    root.remove();
  }

  return { element: root, refresh, destroy };
}
