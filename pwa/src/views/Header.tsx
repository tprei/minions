import type { ReactElement } from "react";
import { cx } from "../util/cx";
import { useTheme } from "../hooks/useTheme";

interface HeaderProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

function ThemeToggle(): ReactElement {
  const { effective, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-fg-muted hover:text-fg hover:bg-bg-elev transition-colors"
      aria-label={effective === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={effective === "dark" ? "Light mode" : "Dark mode"}
    >
      {effective === "dark" ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
}

export function Header({ onToggleSidebar, sidebarOpen }: HeaderProps): ReactElement {
  return (
    <header className="flex-shrink-0 h-12 frosted flex items-center relative z-50">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="w-12 h-12 flex items-center justify-center text-fg-subtle hover:text-fg transition-colors flex-shrink-0"
        aria-label="Toggle sidebar"
        aria-expanded={sidebarOpen}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      <span className="text-sm font-semibold text-fg flex-1 min-w-0 truncate">Minions</span>
      <div className="flex items-center gap-1 pr-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
