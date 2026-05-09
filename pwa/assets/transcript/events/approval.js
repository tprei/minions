export function render(event, ctx) {
  const workflowId = ctx?.workflowId ?? "";
  const taskId = ctx?.taskId ?? "";
  const requestId = event.id ?? "";
  const tool = event.tool ?? "unknown";
  const input = event.input ?? {};

  const el = document.createElement("div");
  el.className = "te te-approval";
  el.dataset.requestId = requestId;

  const header = document.createElement("div");
  header.className = "te-approval-header";
  header.textContent = `Permission request: ${tool}`;

  const inputPreview = document.createElement("div");
  inputPreview.className = "te-approval-input-preview";
  const inputStr = JSON.stringify(input);
  inputPreview.textContent = inputStr.length > 120 ? inputStr.slice(0, 120) + "…" : inputStr;

  const errorMsg = document.createElement("div");
  errorMsg.className = "te-approval-error";
  errorMsg.hidden = true;

  const successMsg = document.createElement("div");
  successMsg.className = "te-approval-success";
  successMsg.hidden = true;

  const defaultActions = document.createElement("div");
  defaultActions.className = "te-approval-actions";

  const approveBtn = document.createElement("button");
  approveBtn.className = "te-approval-approve-btn";
  approveBtn.type = "button";
  approveBtn.textContent = "Approve";

  const denyBtn = document.createElement("button");
  denyBtn.className = "te-approval-deny-btn";
  denyBtn.type = "button";
  denyBtn.textContent = "Deny";

  defaultActions.appendChild(approveBtn);
  defaultActions.appendChild(denyBtn);

  const denyForm = document.createElement("div");
  denyForm.className = "te-approval-deny-form";
  denyForm.hidden = true;

  const denyTextarea = document.createElement("textarea");
  denyTextarea.className = "te-approval-deny-textarea";
  denyTextarea.placeholder = "Reason for denial (required)";

  const denyFormActions = document.createElement("div");
  denyFormActions.className = "te-approval-deny-form-actions";

  const submitDenyBtn = document.createElement("button");
  submitDenyBtn.className = "te-approval-submit-deny-btn";
  submitDenyBtn.type = "button";
  submitDenyBtn.textContent = "Submit Deny";
  submitDenyBtn.disabled = true;

  const backBtn = document.createElement("button");
  backBtn.className = "te-approval-back-btn";
  backBtn.type = "button";
  backBtn.textContent = "Back";

  denyFormActions.appendChild(submitDenyBtn);
  denyFormActions.appendChild(backBtn);
  denyForm.appendChild(denyTextarea);
  denyForm.appendChild(denyFormActions);

  el.appendChild(header);
  el.appendChild(inputPreview);
  el.appendChild(errorMsg);
  el.appendChild(successMsg);
  el.appendChild(defaultActions);
  el.appendChild(denyForm);

  function setResolved(label) {
    defaultActions.hidden = true;
    denyForm.hidden = true;
    errorMsg.hidden = true;
    successMsg.hidden = false;
    successMsg.textContent = label;
    el.dataset.resolved = "true";
    if (ctx?.onResolved) ctx.onResolved(requestId);
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.hidden = false;
  }

  approveBtn.addEventListener("click", () => {
    approveBtn.disabled = true;
    denyBtn.disabled = true;
    errorMsg.hidden = true;

    const body = { kind: "approve-permission", workflowId, taskId, requestId, decision: "approve" };
    fetch("/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) => {
      if (res.ok) {
        setResolved("Approved");
      } else {
        approveBtn.disabled = false;
        denyBtn.disabled = false;
        showError(`Server error: ${res.status}`);
      }
    }).catch((err) => {
      approveBtn.disabled = false;
      denyBtn.disabled = false;
      showError(err instanceof Error ? err.message : "Request failed");
    });
  });

  denyBtn.addEventListener("click", () => {
    defaultActions.hidden = true;
    denyForm.hidden = false;
    denyTextarea.focus();
  });

  denyTextarea.addEventListener("input", () => {
    submitDenyBtn.disabled = denyTextarea.value.trim() === "";
  });

  backBtn.addEventListener("click", () => {
    denyForm.hidden = true;
    defaultActions.hidden = false;
    denyTextarea.value = "";
    submitDenyBtn.disabled = true;
  });

  submitDenyBtn.addEventListener("click", () => {
    const reason = denyTextarea.value.trim();
    if (!reason) return;

    submitDenyBtn.disabled = true;
    backBtn.disabled = true;
    errorMsg.hidden = true;

    const body = { kind: "approve-permission", workflowId, taskId, requestId, decision: "deny", reason };
    fetch("/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) => {
      if (res.ok) {
        setResolved("Denied");
      } else {
        submitDenyBtn.disabled = false;
        backBtn.disabled = false;
        showError(`Server error: ${res.status}`);
      }
    }).catch((err) => {
      submitDenyBtn.disabled = false;
      backBtn.disabled = false;
      showError(err instanceof Error ? err.message : "Request failed");
    });
  });

  el.__approve = function () {
    if (!approveBtn.disabled && !defaultActions.hidden) approveBtn.click();
  };

  el.__openDeny = function () {
    if (!denyBtn.disabled && !defaultActions.hidden) denyBtn.click();
  };

  return el;
}
