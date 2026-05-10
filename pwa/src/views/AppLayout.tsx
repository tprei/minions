import { useState, useCallback, useRef, type ReactElement, type ReactNode } from "react";
import { cx } from "../util/cx";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useEdgeSwipe } from "../hooks/gestures";
import { Sheet } from "../components/Sheet";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { BottomTabs } from "./BottomTabs";
import type { RouteName } from "../routing/parseUrl";

const MOBILE_QUERY = "(max-width: 767px)";

interface AppLayoutProps {
  activeRoute: RouteName;
  children: ReactNode;
}

export function AppLayout({ activeRoute, children }: AppLayoutProps): ReactElement {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  const closeMobileSidebar = (): void => {
    if (isMobile) setSidebarOpen(false);
  };

  return (
    <div ref={rootRef} className="h-full flex flex-col bg-bg overflow-hidden">
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

        <main className="flex-1 min-w-0 overflow-y-auto">
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
    </div>
  );
}
