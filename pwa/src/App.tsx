import type { ReactElement } from "react";
import { useRoute } from "./routing/router";
import { AppLayout } from "./views/AppLayout";
import { WorkflowList } from "./views/WorkflowList";
import { WorkflowDetail } from "./views/WorkflowDetail";
import { NewWorkflowSheet } from "./views/NewWorkflowSheet";
import { ActivityTab } from "./views/ActivityTab";

function Placeholder({ label }: { label: string }): ReactElement {
  return (
    <div className="flex items-center justify-center h-64 text-fg-muted text-sm">
      {label} — coming in S5+
    </div>
  );
}

export function App(): ReactElement {
  const route = useRoute();

  function renderView(): ReactElement {
    switch (route.name) {
      case "workflow-list": return <WorkflowList />;
      case "workflow-detail": return <WorkflowDetail id={route.id} />;
      case "audit":
      case "alerts":
        return <ActivityTab activeRoute={route.name} />;
      case "new-workflow": return <NewWorkflowSheet />;
      case "account": return <Placeholder label="Account" />;
      case "not-found": return <WorkflowList />;
    }
  }

  const isDetail = route.name === "workflow-detail";
  const isActivity = route.name === "audit" || route.name === "alerts";

  return (
    <AppLayout activeRoute={route.name}>
      {isDetail || isActivity ? renderView() : <div className="p-4">{renderView()}</div>}
    </AppLayout>
  );
}
