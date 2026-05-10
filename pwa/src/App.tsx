import type { ReactElement } from "react";
import { useRoute } from "./routing/router";
import { AppLayout } from "./views/AppLayout";
import { WorkflowList } from "./views/WorkflowList";
import { WorkflowDetail } from "./views/WorkflowDetail";
import { CompactNewWorkflowModal } from "./views/CompactNewWorkflowModal";

function Placeholder({ label }: { label: string }): ReactElement {
  return (
    <div className="flex items-center justify-center h-64 text-fg-muted text-sm">
      {label} — coming in S4+
    </div>
  );
}

export function App(): ReactElement {
  const route = useRoute();

  function renderView(): ReactElement {
    switch (route.name) {
      case "workflow-list": return <WorkflowList />;
      case "workflow-detail": return <WorkflowDetail id={route.id} />;
      case "audit": return <Placeholder label="Audit" />;
      case "alerts": return <Placeholder label="Alerts" />;
      case "new-workflow": return <CompactNewWorkflowModal />;
      case "account": return <Placeholder label="Account" />;
      case "not-found": return <WorkflowList />;
    }
  }

  const isDetail = route.name === "workflow-detail";

  return (
    <AppLayout activeRoute={route.name}>
      {isDetail ? renderView() : <div className="p-4">{renderView()}</div>}
    </AppLayout>
  );
}
