import type { Artifact } from "../domain/types";

interface CiCheck {
  name?: string;
  conclusion?: string;
}

interface CiReportData {
  prNumber?: number;
  prUrl?: string;
  headSha?: string;
  failed?: CiCheck[];
  passed?: CiCheck[];
  skipped?: CiCheck[];
}

interface Props {
  artifact: Artifact;
}

export function CiReport({ artifact }: Props): JSX.Element {
  let report: CiReportData;
  try {
    report = JSON.parse(artifact.ref) as CiReportData;
  } catch {
    return <div className="text-xs text-err">Invalid ci-report JSON</div>;
  }

  const failed = Array.isArray(report.failed) ? report.failed : [];
  const passed = Array.isArray(report.passed) ? report.passed : [];
  const skipped = Array.isArray(report.skipped) ? report.skipped : [];

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 text-xs">
        {report.prNumber != null && report.prUrl && (
          <a
            href={report.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            PR #{report.prNumber}
          </a>
        )}
        {report.headSha && (
          <span className="font-mono text-fg-subtle">
            @ {report.headSha.slice(0, 8)}
          </span>
        )}
        <span className="text-ok">{passed.length} passed</span>
        <span className="text-err">{failed.length} failed</span>
        <span className="text-fg-subtle">{skipped.length} skipped</span>
      </div>

      {failed.length > 0 && (
        <div className="space-y-0.5">
          {failed.map((check, i) => (
            <div key={i} className="text-[11px] text-err">
              ✗ {check.name ?? "—"} — {check.conclusion ?? "failed"}
            </div>
          ))}
        </div>
      )}

      {failed.length === 0 && (
        <div className="text-[11px] text-ok">All checks passed</div>
      )}
    </div>
  );
}
