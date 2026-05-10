import type { ReactElement } from "react";
import { useRoute } from "./routing/router";
import { AppLayout } from "./views/AppLayout";
import { WorkflowList } from "./views/WorkflowList";

function Placeholder({ label }: { label: string }): ReactElement {
  return (
    <div className="flex items-center justify-center h-64 text-fg-muted text-sm">
      {label} — coming in S2+
    </div>
  );
}

export function App(): ReactElement {
  const route = useRoute();

  function renderView(): ReactElement {
    switch (route.name) {
      case "workflow-list": return <WorkflowList />;
      case "workflow-detail": return <Placeholder label={`Workflow ${route.id}`} />;
      case "audit": return <Placeholder label="Audit" />;
      case "alerts": return <Placeholder label="Alerts" />;
      case "new-workflow": return <Placeholder label="New workflow" />;
      case "account": return <Placeholder label="Account" />;
      case "not-found": return <WorkflowList />;
    }
  }

  return (
    <AppLayout activeRoute={route.name}>
      <div className="p-4">
        {renderView()}
      </div>
    </AppLayout>
  );
}
