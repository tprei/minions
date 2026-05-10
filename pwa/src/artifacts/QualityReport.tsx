import type { Artifact } from "../domain/types";
import { Pill } from "../components/Pill";

interface QualityCheck {
  name?: string;
  status?: string;
}

interface QualityReportData {
  overallStatus?: string;
  checks?: QualityCheck[];
}

function overallTone(status: string | undefined): "ok" | "warn" | "err" | "neutral" {
  if (status === "pass" || status === "passed") return "ok";
  if (status === "fail" || status === "failed") return "err";
  if (status === "warn" || status === "warning") return "warn";
  return "neutral";
}

interface Props {
  artifact: Artifact;
}

export function QualityReport({ artifact }: Props): JSX.Element {
  let report: QualityReportData;
  try {
    report = JSON.parse(artifact.ref) as QualityReportData;
  } catch {
    return <div className="text-xs text-err">Invalid quality-report JSON</div>;
  }

  const checks = Array.isArray(report.checks) ? report.checks : [];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Pill tone={overallTone(report.overallStatus)} className="text-[10px]">
          {report.overallStatus ?? "unknown"}
        </Pill>
        <span className="text-xs text-fg-muted">Quality report</span>
      </div>

      {checks.length > 0 && (
        <div className="space-y-0.5">
          {checks.map((check, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="text-fg-muted truncate">{check.name ?? "—"}</span>
              <span
                className={
                  check.status === "pass" || check.status === "passed"
                    ? "text-ok"
                    : check.status === "fail" || check.status === "failed"
                      ? "text-err"
                      : "text-fg-subtle"
                }
              >
                {check.status ?? "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
