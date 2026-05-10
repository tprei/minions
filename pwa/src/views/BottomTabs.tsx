import type { ReactElement } from "react";
import { cx } from "../util/cx";
import { navigate } from "../routing/router";
import type { RouteName } from "../routing/parseUrl";

interface TabItem {
  route: string;
  name: RouteName;
  label: string;
  icon: ReactElement;
  fab?: boolean;
}

function WorkflowsIcon(): ReactElement {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function ActivityIcon(): ReactElement {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function PlusIcon(): ReactElement {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function AccountIcon(): ReactElement {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

const TABS: TabItem[] = [
  { route: "/", name: "workflow-list", label: "Workflows", icon: <WorkflowsIcon /> },
  { route: "/audit", name: "audit", label: "Activity", icon: <ActivityIcon /> },
  { route: "/new", name: "new-workflow", label: "New", icon: <PlusIcon />, fab: true },
  { route: "/account", name: "account", label: "Account", icon: <AccountIcon /> },
];

interface BottomTabsProps {
  activeRoute: RouteName;
}

export function BottomTabs({ activeRoute }: BottomTabsProps): ReactElement {
  return (
    <nav
      className="flex-shrink-0 flex items-stretch border-t border-border bg-bg"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((tab) => {
        const active = activeRoute === tab.name;
        if (tab.fab) {
          return (
            <button
              key={tab.name}
              type="button"
              onClick={() => navigate(tab.route)}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5"
              aria-label={tab.label}
            >
              <span className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white shadow-lg">
                {tab.icon}
              </span>
            </button>
          );
        }
        return (
          <button
            key={tab.name}
            type="button"
            onClick={() => navigate(tab.route)}
            className={cx(
              "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] transition-colors",
              active ? "text-accent" : "text-fg-subtle",
            )}
            aria-label={tab.label}
            aria-current={active ? "page" : undefined}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
