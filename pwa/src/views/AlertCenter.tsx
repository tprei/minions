import { useEffect } from "react";
import { useAlertStore } from "../store/useAlertStore";
import { Pill } from "../components/Pill";
import { Spinner } from "../components/Spinner";
import { Banner } from "../components/Banner";
import type { AlertSeverity } from "../domain/types";

function severityTone(severity: AlertSeverity): "warn" | "err" {
  return severity === "error" ? "err" : "warn";
}

export function AlertCenter(): JSX.Element {
  const alerts = useAlertStore((s) => s.alerts);
  const loading = useAlertStore((s) => s.loading);
  const error = useAlertStore((s) => s.error);
  const loadAlerts = useAlertStore((s) => s.loadAlerts);
  const markRead = useAlertStore((s) => s.markRead);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  if (loading && alerts.length === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {error && <Banner tone="error" message={error} />}

      {alerts.length === 0 && !error && (
        <div className="flex items-center justify-center h-32 text-sm text-fg-muted">
          No alerts
        </div>
      )}

      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`card p-3 ${alert.acknowledgedAt !== undefined ? "opacity-50" : ""}`}
        >
          <div className="flex items-start gap-2">
            <Pill tone={severityTone(alert.severity)} className="shrink-0 text-[10px]">
              {alert.severity}
            </Pill>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono text-fg-muted mb-0.5">{alert.kind}</div>
              <div className="text-sm text-fg leading-snug">{alert.message}</div>
              {alert.workflowId && (
                <a
                  href={`#/workflow/${encodeURIComponent(alert.workflowId)}`}
                  className="text-xs text-accent mt-1 inline-block"
                >
                  View workflow →
                </a>
              )}
            </div>
            {alert.acknowledgedAt === undefined && (
              <button
                type="button"
                onClick={() => markRead(alert.id)}
                className="shrink-0 text-[11px] text-fg-subtle hover:text-fg transition-colors px-1.5 py-0.5 rounded hover:bg-bg-elev"
              >
                Mark read
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
