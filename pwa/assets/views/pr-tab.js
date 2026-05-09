function toApiUrl(ref) {
  const htmlMatch = ref.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (htmlMatch) {
    return `https://api.github.com/repos/${htmlMatch[1]}/${htmlMatch[2]}/pulls/${htmlMatch[3]}`;
  }
  return ref;
}

const prDetailCache = new Map();

function fetchPrDetail(prRef, githubProxy) {
  const apiUrl = toApiUrl(prRef);
  const cacheEntry = prDetailCache.get(apiUrl);
  if (cacheEntry && Date.now() - cacheEntry.ts < 30000) {
    return Promise.resolve(cacheEntry.data);
  }
  const proxyUrl = `${githubProxy}?url=${encodeURIComponent(apiUrl)}`;
  return fetch(proxyUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`upstream ${r.status}`);
      return r.json();
    })
    .then((data) => {
      prDetailCache.set(apiUrl, { data, ts: Date.now() });
      return data;
    });
}

function mergeableClass(mergeable) {
  if (mergeable === "clean") return "mergeable-clean";
  if (mergeable === "dirty") return "mergeable-dirty";
  if (mergeable === "blocked") return "mergeable-blocked";
  if (mergeable === "unstable") return "mergeable-unstable";
  return "mergeable-unknown";
}

function stateClass(state) {
  if (state === "open") return "pr-state-open";
  if (state === "closed") return "pr-state-closed";
  if (state === "merged") return "pr-state-merged";
  return "pr-state-unknown";
}

function buildHeader(prDetail) {
  const header = document.createElement("div");
  header.className = "pr-tab-header";

  const titleEl = document.createElement("div");
  titleEl.className = "pr-tab-title";
  titleEl.textContent = prDetail.title ?? "";
  header.appendChild(titleEl);

  const meta = document.createElement("div");
  meta.className = "pr-tab-meta";

  const statePill = document.createElement("span");
  statePill.className = `pr-state-pill ${stateClass(prDetail.state)}`;
  statePill.textContent = prDetail.state ?? "unknown";
  meta.appendChild(statePill);

  const mergeableValue = prDetail.mergeable_state ?? prDetail.mergeable ?? undefined;
  const mergeableBadge = document.createElement("span");
  mergeableBadge.className = `pr-mergeable-badge ${mergeableClass(mergeableValue)}`;
  mergeableBadge.textContent = mergeableValue ?? "unknown";
  meta.appendChild(mergeableBadge);

  if (prDetail.user?.login) {
    const authorChip = document.createElement("span");
    authorChip.className = "pr-author-chip";
    if (prDetail.user.avatar_url) {
      const img = document.createElement("img");
      img.src = prDetail.user.avatar_url;
      img.alt = prDetail.user.login;
      img.className = "pr-author-avatar";
      authorChip.appendChild(img);
    }
    const loginText = document.createTextNode(prDetail.user.login);
    authorChip.appendChild(loginText);
    meta.appendChild(authorChip);
  }

  header.appendChild(meta);

  const headRef = prDetail.head?.ref ?? prDetail.head_ref;
  const baseRef = prDetail.base?.ref ?? prDetail.base_ref;
  if (headRef || baseRef) {
    const refs = document.createElement("div");
    refs.className = "pr-refs";
    refs.textContent = `${headRef ?? "?"} → ${baseRef ?? "?"}`;
    header.appendChild(refs);
  }

  return header;
}

export function createPrTab({ task, workflow, deps = {} }) {
  const { githubProxy = "/github/pr-detail" } = deps;

  const root = document.createElement("div");
  root.className = "pr-tab";

  const prArtifact = task?.artifacts
    ? [...task.artifacts].reverse().find((a) => a.kind === "pr")
    : null;

  if (!prArtifact) {
    root.style.display = "none";
    return {
      element: root,
      refresh() {},
      destroy() { root.remove(); },
    };
  }

  const headerWrap = document.createElement("div");
  headerWrap.className = "pr-tab-header-wrap";
  headerWrap.textContent = "Loading…";
  root.appendChild(headerWrap);

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "pr-tab-body";
  root.appendChild(bodyWrap);

  const footer = document.createElement("div");
  footer.className = "pr-tab-footer";
  root.appendChild(footer);

  let currentPrDetail = null;
  let checksPanel = null;
  let diffViewer = null;
  let mergeProgress = null;

  const { createChecksPanel } = deps;
  const { createDiffViewer } = deps;

  function renderMergeProgress(taskId) {
    if (!deps.createMergeProgress) return;
    if (mergeProgress) {
      mergeProgress.destroy();
      mergeProgress = null;
    }
    mergeProgress = deps.createMergeProgress(taskId);
    root.insertBefore(mergeProgress.element, bodyWrap);
  }

  function renderBody(prDetail) {
    currentPrDetail = prDetail;

    headerWrap.innerHTML = "";
    headerWrap.appendChild(buildHeader(prDetail));

    bodyWrap.innerHTML = "";

    if (checksPanel) {
      checksPanel.destroy();
      checksPanel = null;
    }
    if (diffViewer) {
      diffViewer.destroy();
      diffViewer = null;
    }

    if (createChecksPanel) {
      checksPanel = createChecksPanel({ prDetail, githubProxy });
      bodyWrap.appendChild(checksPanel.element);
    }

    const files = prDetail.files ?? [];
    if (createDiffViewer) {
      diffViewer = createDiffViewer({ prDetail, files });
      bodyWrap.appendChild(diffViewer.element);
    }

    renderFooter(prDetail);
  }

  function renderFooter(prDetail) {
    footer.innerHTML = "";

    const mergeableValue = prDetail.mergeable_state ?? prDetail.mergeable ?? undefined;
    const isClean = mergeableValue === "clean";

    const landBtn = document.createElement("button");
    landBtn.className = "pr-tab-land-btn";
    landBtn.textContent = "Land";
    landBtn.disabled = !isClean;

    if (!isClean) {
      const helper = document.createElement("span");
      helper.className = "pr-tab-land-helper";
      helper.textContent = `Not mergeable: ${mergeableValue ?? "unknown"}`;
      footer.appendChild(helper);
    }

    landBtn.addEventListener("click", () => {
      if (!workflow?.id || !task?.id) return;
      fetch(`/workflows/${workflow.id}/tasks/${task.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          renderMergeProgress(task.id);
        })
        .catch(() => {});
    });

    footer.appendChild(landBtn);
  }

  function renderError(msg) {
    headerWrap.innerHTML = "";
    const err = document.createElement("div");
    err.className = "pr-tab-error";
    err.textContent = `Error: ${msg}`;
    headerWrap.appendChild(err);
  }

  function load() {
    fetchPrDetail(prArtifact.ref, githubProxy)
      .then((data) => renderBody(data))
      .catch((err) => renderError(err.message));
  }

  load();

  function refresh() {
    const apiUrl = toApiUrl(prArtifact.ref);
    prDetailCache.delete(apiUrl);
    if (checksPanel) checksPanel.refresh();
    load();
  }

  function destroy() {
    if (checksPanel) checksPanel.destroy();
    if (diffViewer) diffViewer.destroy();
    if (mergeProgress) mergeProgress.destroy();
    root.remove();
  }

  return { element: root, refresh, destroy };
}
