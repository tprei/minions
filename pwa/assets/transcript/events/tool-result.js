export function render(event, ctx) {
  const el = document.createElement("div");
  el.className = event.isError
    ? "te te-tool-result te-tool-result-error"
    : "te te-tool-result";

  const label = document.createElement("span");
  label.className = "te-tool-result-label";
  label.textContent = event.isError ? "Error" : "Result";

  const outputEl = document.createElement("pre");
  outputEl.className = "te-tool-result-output";
  outputEl.hidden = ctx?.group?.expanded === false;

  const outputStr =
    typeof event.output === "string"
      ? event.output
      : JSON.stringify(event.output ?? null, null, 2);
  outputEl.textContent = outputStr.length > 500 ? outputStr.slice(0, 500) + "\n… (truncated)" : outputStr;

  el.__setExpanded = function (expanded) {
    outputEl.hidden = !expanded;
  };

  el.appendChild(label);
  el.appendChild(outputEl);
  return el;
}
