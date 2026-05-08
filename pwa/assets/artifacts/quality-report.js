export function render(artifact) {
  let report;
  try {
    report = JSON.parse(artifact.ref);
  } catch (e) {
    throw new Error(`quality-report: failed to parse ref as JSON: ${e.message}`);
  }

  if (typeof report !== "object" || report === null) {
    throw new Error("quality-report: ref JSON is not an object");
  }

  const wrap = document.createElement("div");
  wrap.className = "artifact-quality-report";

  const statusPill = document.createElement("span");
  statusPill.className = `quality-status-pill quality-status-${report.overallStatus ?? "unknown"}`;
  statusPill.textContent = report.overallStatus ?? "unknown";
  wrap.appendChild(statusPill);

  const checks = Array.isArray(report.checks) ? report.checks : [];
  if (checks.length > 0) {
    const table = document.createElement("table");
    table.className = "quality-checks-table";
    for (const check of checks) {
      const row = document.createElement("tr");
      const nameCell = document.createElement("td");
      nameCell.textContent = check.name ?? "";
      const statusCell = document.createElement("td");
      statusCell.textContent = check.status ?? "";
      row.appendChild(nameCell);
      row.appendChild(statusCell);
      table.appendChild(row);
    }
    wrap.appendChild(table);
  }

  return wrap;
}
