export function render(artifact) {
  let report;
  try {
    report = JSON.parse(artifact.ref);
  } catch (e) {
    throw new Error(`ci-report: failed to parse ref as JSON: ${e.message}`);
  }

  if (typeof report !== "object" || report === null) {
    throw new Error("ci-report: ref JSON is not an object");
  }

  const wrap = document.createElement("div");
  wrap.className = "artifact-ci-report";

  if (report.prNumber != null && report.prUrl) {
    const link = document.createElement("a");
    link.className = "ci-pr-link";
    link.href = report.prUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `PR #${report.prNumber}`;
    wrap.appendChild(link);
  }

  if (report.headSha) {
    const sha = document.createElement("span");
    sha.className = "ci-head-sha";
    sha.textContent = `@ ${String(report.headSha).slice(0, 8)}`;
    wrap.appendChild(sha);
  }

  const failed = Array.isArray(report.failed) ? report.failed : [];
  if (failed.length > 0) {
    const list = document.createElement("ul");
    list.className = "ci-failed-list";
    for (const check of failed) {
      const item = document.createElement("li");
      item.className = "ci-failed-item";
      item.textContent = `${check.name} — ${check.conclusion}`;
      list.appendChild(item);
    }
    wrap.appendChild(list);
  } else {
    const ok = document.createElement("span");
    ok.className = "ci-all-green";
    ok.textContent = "All checks passed";
    wrap.appendChild(ok);
  }

  return wrap;
}
