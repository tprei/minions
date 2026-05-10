import type { RouteName } from "../routing/parseUrl";
import { navigate } from "../routing/router";
import { AuditFeed } from "./AuditFeed";
import { AlertCenter } from "./AlertCenter";
import { cx } from "../util/cx";

interface Props {
  activeRoute: RouteName;
}

export function ActivityTab({ activeRoute }: Props): JSX.Element {
  const sub = activeRoute === "alerts" ? "alerts" : "audit";

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-0 border-b border-border shrink-0">
        <button
          type="button"
          onClick={() => navigate("/audit")}
          className={cx(
            "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
            sub === "audit"
              ? "border-accent text-fg"
              : "border-transparent text-fg-muted hover:text-fg",
          )}
        >
          Audit
        </button>
        <button
          type="button"
          onClick={() => navigate("/alerts")}
          className={cx(
            "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
            sub === "alerts"
              ? "border-accent text-fg"
              : "border-transparent text-fg-muted hover:text-fg",
          )}
        >
          Alerts
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {sub === "audit" ? <AuditFeed /> : <AlertCenter />}
      </div>
    </div>
  );
}
