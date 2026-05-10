import { useState, useCallback, useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { cx } from "../util/cx";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useEdgeSwipe } from "../hooks/gestures";
import { useSwipeUp } from "../hooks/useSwipeUp";
import { Sheet } from "../components/Sheet";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { BottomTabs } from "./BottomTabs";
import { InstallBanner } from "./InstallBanner";
import { CommandPalette, type PaletteAction } from "../components/CommandPalette";
import { navigate } from "../routing/router";
import { useTheme } from "../hooks/useTheme";
import type { RouteName } from "../routing/parseUrl";

const MOBILE_QUERY = "(max-width: 767px)";

interface AppLayoutProps {
  activeRoute: RouteName;
  children: ReactNode;
}

export function AppLayout({ activeRoute, children }: AppLayoutProps): ReactElement {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { toggle: toggleTheme } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return !window.matchMedia(MOBILE_QUERY).matches;
  });

  useEdgeSwipe(
    rootRef,
    useCallback(() => {
      if (isMobile) setSidebarOpen(true);
    }, [isMobile]),
    { edge: "left", edgeWidth: 20, threshold: 60 },
  );

  const { ref: swipeCallbackRef } = useSwipeUp({ onSwipeUp: () => setPaletteOpen(true) });

  const combinedRootRef = useCallback(
    (el: HTMLDivElement | null) => {
      rootRef.current = el;
      swipeCallbackRef(el);
    },
    [swipeCallbackRef],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const paletteActions: PaletteAction[] = [
    { id: "new-workflow", label: "New workflow", group: "Navigation", run: () => navigate("#/new") },
    { id: "go-audit", label: "Go to audit", group: "Navigation", run: () => navigate("#/audit") },
    { id: "go-alerts", label: "Go to alerts", group: "Navigation", run: () => navigate("#/alerts") },
    { id: "toggle-theme", label: "Toggle theme", group: "Settings", run: () => toggleTheme() },
  ];

  const closeMobileSidebar = (): void => {
    if (isMobile) setSidebarOpen(false);
  };

  return (
    <div ref={combinedRootRef} className="h-full flex flex-col bg-bg overflow-hidden">
      <Header onToggleSidebar={() => setSidebarOpen((v) => !v)} sidebarOpen={sidebarOpen} />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {!isMobile && (
          <aside
            className={cx(
              "flex-shrink-0 border-r border-border bg-bg-soft transition-all duration-200 overflow-hidden",
              sidebarOpen ? "w-56" : "w-0",
            )}
          >
            <div className="w-56 h-full overflow-y-auto">
              <Sidebar activeRoute={activeRoute} />
            </div>
          </aside>
        )}

        <main className="flex-1 min-w-0 overflow-y-auto flex flex-col">
          <div className="px-4 pt-2">
            <InstallBanner />
          </div>
          {children}
        </main>
      </div>

      {isMobile && (
        <Sheet
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          side="left"
        >
          <div className="-m-4">
            <Sidebar activeRoute={activeRoute} onNavigate={closeMobileSidebar} />
          </div>
        </Sheet>
      )}

      {isMobile && (
        <BottomTabs activeRoute={activeRoute} />
      )}

      {!isMobile && (
        <button
          type="button"
          title="New workflow"
          className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-accent text-white shadow-2xl flex items-center justify-center text-xl hover:bg-accent-soft transition-colors z-30"
          onClick={() => navigate("#/new")}
          aria-label="New workflow"
        >
          +
        </button>
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={paletteActions}
      />
    </div>
  );
}
