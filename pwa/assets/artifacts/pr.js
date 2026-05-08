const cache = new Map();

function toApiUrl(ref) {
  const htmlMatch = ref.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (htmlMatch) {
    return `https://api.github.com/repos/${htmlMatch[1]}/${htmlMatch[2]}/pulls/${htmlMatch[3]}`;
  }
  return ref;
}

function stateClass(state) {
  if (state === "open") return "pr-state-open";
  if (state === "closed") return "pr-state-closed";
  if (state === "merged") return "pr-state-merged";
  return "pr-state-unknown";
}

export function render(artifact, ctx = {}) {
  const { githubProxy } = ctx;
  const wrap = document.createElement("div");
  wrap.className = "artifact-pr";

  const urlLine = document.createElement("a");
  urlLine.className = "artifact-pr-url";
  urlLine.href = artifact.ref;
  urlLine.target = "_blank";
  urlLine.rel = "noopener noreferrer";
  urlLine.textContent = artifact.ref;
  wrap.appendChild(urlLine);

  const detail = document.createElement("div");
  detail.className = "artifact-pr-detail";
  detail.textContent = "Loading…";
  wrap.appendChild(detail);

  function renderDetail(data) {
    detail.innerHTML = "";

    const title = document.createElement("div");
    title.className = "artifact-pr-title";
    title.textContent = data.title ?? "";
    detail.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "artifact-pr-meta";

    const statePill = document.createElement("span");
    statePill.className = `pr-state-pill ${stateClass(data.state)}`;
    statePill.textContent = data.state ?? "";
    meta.appendChild(statePill);

    if (data.user?.login) {
      const author = document.createElement("span");
      author.className = "artifact-pr-author";
      if (data.user.avatar_url) {
        const img = document.createElement("img");
        img.src = data.user.avatar_url;
        img.alt = data.user.login;
        img.className = "artifact-pr-avatar";
        author.appendChild(img);
      }
      const name = document.createTextNode(data.user.login);
      author.appendChild(name);
      meta.appendChild(author);
    }

    detail.appendChild(meta);

    if (data.body) {
      const bodyToggle = document.createElement("button");
      bodyToggle.className = "artifact-pr-body-toggle";
      bodyToggle.textContent = "Description ▾";
      const bodyEl = document.createElement("div");
      bodyEl.className = "artifact-pr-body";
      bodyEl.textContent = data.body;
      bodyEl.style.display = "none";
      bodyToggle.addEventListener("click", () => {
        const expanded = bodyEl.style.display !== "none";
        bodyEl.style.display = expanded ? "none" : "block";
        bodyToggle.textContent = expanded ? "Description ▾" : "Description ▴";
      });
      detail.appendChild(bodyToggle);
      detail.appendChild(bodyEl);
    }
  }

  function renderError(msg) {
    detail.textContent = `Error: ${msg}`;
  }

  const apiUrl = toApiUrl(artifact.ref);

  function fetchDetail() {
    if (!githubProxy) return;

    const cacheEntry = cache.get(apiUrl);
    if (cacheEntry && Date.now() - cacheEntry.ts < 30000) {
      renderDetail(cacheEntry.data);
      return;
    }

    const proxyUrl = `${githubProxy}?url=${encodeURIComponent(apiUrl)}`;
    fetch(proxyUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json();
      })
      .then((data) => {
        cache.set(apiUrl, { data, ts: Date.now() });
        renderDetail(data);
      })
      .catch((err) => renderError(err.message));
  }

  fetchDetail();

  const onFocus = () => {
    const entry = cache.get(apiUrl);
    if (!entry || Date.now() - entry.ts >= 30000) {
      fetchDetail();
    }
  };
  window.addEventListener("focus", onFocus);

  wrap.__artifactCleanup = () => window.removeEventListener("focus", onFocus);

  return wrap;
}
