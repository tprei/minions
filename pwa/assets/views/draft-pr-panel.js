function createSkeleton(className) {
  const el = document.createElement("div");
  el.className = className;
  return el;
}

function errorMessageFor(status, body) {
  if (status === 504 || (body && body.code === "draft_pr_timeout")) {
    return "Request timed out — the provider took more than 30s. Try again.";
  }
  if (status === 503 || (body && body.code === "internal_error" && !body.code.startsWith("draft_pr"))) {
    return "Auto-draft is not configured on this engine.";
  }
  if (status === 422 || (body && body.code === "invalid_transition")) {
    return "This task has no branch yet — draft unavailable.";
  }
  if (status === 500 || (body && body.code === "draft_pr_parse_error")) {
    return "The provider returned an unparseable response. Try again.";
  }
  return `Unexpected error (HTTP ${status}).`;
}

export function createDraftPrPanel({ workflowId, taskId, onDraft }) {
  const root = document.createElement("div");
  root.className = "draft-pr-panel";

  let abortController = null;
  let currentState = "idle";
  let lastDraft = null;

  const idleView = document.createElement("div");
  idleView.className = "draft-pr-idle";

  const autoDraftBtn = document.createElement("button");
  autoDraftBtn.className = "draft-pr-auto-btn";
  autoDraftBtn.textContent = "Auto-draft PR title and body";
  idleView.appendChild(autoDraftBtn);

  const loadingView = document.createElement("div");
  loadingView.className = "draft-pr-loading";

  const loadingHeader = document.createElement("div");
  loadingHeader.className = "draft-pr-loading-header";

  const spinner = document.createElement("div");
  spinner.className = "draft-pr-spinner";
  loadingHeader.appendChild(spinner);

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "draft-pr-cancel-btn";
  cancelBtn.textContent = "Cancel";
  loadingHeader.appendChild(cancelBtn);

  loadingView.appendChild(loadingHeader);

  const skeletonTitle = createSkeleton("draft-pr-skeleton draft-pr-skeleton-title");
  const skeletonBody = createSkeleton("draft-pr-skeleton draft-pr-skeleton-body");
  loadingView.appendChild(skeletonTitle);
  loadingView.appendChild(skeletonBody);

  const loadedView = document.createElement("div");
  loadedView.className = "draft-pr-loaded";

  const titleLabel = document.createElement("label");
  titleLabel.className = "draft-pr-field-label";
  titleLabel.textContent = "PR title";

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.className = "draft-pr-title-input";

  const bodyLabel = document.createElement("label");
  bodyLabel.className = "draft-pr-field-label";
  bodyLabel.textContent = "PR body";

  const bodyTextarea = document.createElement("textarea");
  bodyTextarea.className = "draft-pr-body-textarea";
  bodyTextarea.rows = 8;

  const loadedActions = document.createElement("div");
  loadedActions.className = "draft-pr-loaded-actions";

  const copyTitleBtn = document.createElement("button");
  copyTitleBtn.className = "draft-pr-copy-title-btn";
  copyTitleBtn.textContent = "Copy title";

  const copyBodyBtn = document.createElement("button");
  copyBodyBtn.className = "draft-pr-copy-body-btn";
  copyBodyBtn.textContent = "Copy body";

  const redraftBtn = document.createElement("button");
  redraftBtn.className = "draft-pr-redraft-btn";
  redraftBtn.textContent = "Re-draft";

  loadedActions.appendChild(copyTitleBtn);
  loadedActions.appendChild(copyBodyBtn);
  loadedActions.appendChild(redraftBtn);

  loadedView.appendChild(titleLabel);
  loadedView.appendChild(titleInput);
  loadedView.appendChild(bodyLabel);
  loadedView.appendChild(bodyTextarea);
  loadedView.appendChild(loadedActions);

  const errorView = document.createElement("div");
  errorView.className = "draft-pr-error";

  const errorMsg = document.createElement("div");
  errorMsg.className = "draft-pr-error-msg";

  const retryBtn = document.createElement("button");
  retryBtn.className = "draft-pr-retry-btn";
  retryBtn.textContent = "Retry";

  errorView.appendChild(errorMsg);
  errorView.appendChild(retryBtn);

  root.appendChild(idleView);
  root.appendChild(loadingView);
  root.appendChild(loadedView);
  root.appendChild(errorView);

  function setState(state) {
    currentState = state;
    idleView.style.display = state === "idle" ? "" : "none";
    loadingView.style.display = state === "loading" ? "" : "none";
    loadedView.style.display = state === "loaded" ? "" : "none";
    errorView.style.display = state === "error" ? "" : "none";
  }

  setState("idle");

  async function doFetch() {
    abortController = new AbortController();
    setState("loading");

    let status = 0;
    let body = null;

    try {
      const res = await fetch(
        `/workflows/${workflowId}/tasks/${taskId}/draft-pr`,
        { method: "POST", signal: abortController.signal },
      );
      status = res.status;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      if (!res.ok) {
        errorMsg.textContent = errorMessageFor(status, body);
        setState("error");
        return;
      }

      lastDraft = { title: body.title ?? "", body: body.body ?? "" };
      titleInput.value = lastDraft.title;
      bodyTextarea.value = lastDraft.body;
      setState("loaded");
      onDraft?.(lastDraft);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setState("idle");
        return;
      }
      errorMsg.textContent = errorMessageFor(status, body);
      setState("error");
    } finally {
      abortController = null;
    }
  }

  autoDraftBtn.addEventListener("click", () => {
    doFetch().catch(() => {});
  });

  cancelBtn.addEventListener("click", () => {
    if (abortController) {
      abortController.abort();
    }
  });

  retryBtn.addEventListener("click", () => {
    doFetch().catch(() => {});
  });

  redraftBtn.addEventListener("click", () => {
    doFetch().catch(() => {});
  });

  copyTitleBtn.addEventListener("click", () => {
    if (titleInput.value) {
      navigator.clipboard?.writeText(titleInput.value).catch(() => {});
    }
  });

  copyBodyBtn.addEventListener("click", () => {
    if (bodyTextarea.value) {
      navigator.clipboard?.writeText(bodyTextarea.value).catch(() => {});
    }
  });

  function cancel() {
    if (abortController) {
      abortController.abort();
    }
  }

  function destroy() {
    cancel();
    root.remove();
  }

  return {
    element: root,
    fetch: () => { doFetch().catch(() => {}); },
    cancel,
    destroy,
  };
}
