import type { ReactElement } from "react";
import { cx } from "../util/cx";
import { navigate } from "../routing/router";
import type { RouteName } from "../routing/parseUrl";

interface NavItem {
  route: string;
  name: RouteName;
  label: string;
  icon: ReactElement;
}

function WorkflowsIcon(): ReactElement {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function AuditIcon(): ReactElement {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function AlertsIcon(): ReactElement {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function PlusIcon(): ReactElement {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { route: "/", name: "workflow-list", label: "Workflows", icon: <WorkflowsIcon /> },
  { route: "/audit", name: "audit", label: "Audit", icon: <AuditIcon /> },
  { route: "/alerts", name: "alerts", label: "Alerts", icon: <AlertsIcon /> },
  { route: "/new", name: "new-workflow", label: "New", icon: <PlusIcon /> },
];

interface SidebarProps {
  activeRoute: RouteName;
  onNavigate?: () => void;
}

export function Sidebar({ activeRoute, onNavigate }: SidebarProps): ReactElement {
  function handleNav(route: string): void {
    navigate(route);
    onNavigate?.();
  }

  return (
    <nav className="flex flex-col h-full py-2 gap-0.5">
      <p className="text-xs text-fg-subtle uppercase tracking-wider px-4 py-1">Navigation</p>
      {NAV_ITEMS.map((item) => (
        <button
          key={item.name}
          type="button"
          onClick={() => handleNav(item.route)}
          className={cx(
            "w-full flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors text-left mx-1",
            activeRoute === item.name
              ? "bg-accent/20 text-fg"
              : "text-fg-muted hover:text-fg hover:bg-bg-elev",
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </nav>
  );
}
