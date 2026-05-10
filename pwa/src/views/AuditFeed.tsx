import { useEffect, useRef, useState, useCallback } from "react";
import { useAuditStore, type AuditFilters } from "../store/useAuditStore";
import { Spinner } from "../components/Spinner";

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const PULL_THRESHOLD = 72;

export function AuditFeed(): JSX.Element {
  const events = useAuditStore((s) => s.events);
  const loading = useAuditStore((s) => s.loading);
  const done = useAuditStore((s) => s.done);
  const loadInitial = useAuditStore((s) => s.loadInitial);
  const loadMore = useAuditStore((s) => s.loadMore);

  const [actionFilter, setActionFilter] = useState("");
  const [workflowFilter, setWorkflowFilter] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const touchStartY = useRef(0);
  const pulling = useRef(false);
  const [pullOffset, setPullOffset] = useState(0);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const applyFilters = useCallback(() => {
    const filters: AuditFilters = {};
    if (actionFilter.trim()) filters.action = actionFilter.trim();
    if (workflowFilter.trim()) filters.workflowId = workflowFilter.trim();
    void loadInitial(filters);
  }, [actionFilter, workflowFilter, loadInitial]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading && !done) {
          void loadMore();
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loading, done, loadMore]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent): void {
      if (el!.scrollTop === 0 && e.touches[0]) {
        touchStartY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    }

    function onTouchMove(e: TouchEvent): void {
      if (!pulling.current || !e.touches[0]) return;
      const delta = e.touches[0].clientY - touchStartY.current;
      if (delta > 0) {
        e.preventDefault();
        setPullOffset(Math.min(delta, PULL_THRESHOLD + 24));
      }
    }

    function onTouchEnd(): void {
      if (!pulling.current) return;
      pulling.current = false;
      if (pullOffset >= PULL_THRESHOLD) {
        void loadInitial();
      }
      setPullOffset(0);
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [loadInitial, pullOffset]);

  function toggleExpand(id: string): void {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full">
      {pullOffset > 0 && (
        <div
          className="flex items-center justify-center text-xs text-fg-muted transition-all"
          style={{ height: pullOffset }}
        >
          {pullOffset >= PULL_THRESHOLD ? "Release to refresh" : "Pull to refresh"}
        </div>
      )}

      <div className="flex gap-2 px-4 pt-3 pb-2 border-b border-border shrink-0">
        <input
          type="text"
          placeholder="Filter by action…"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
          className="flex-1 text-xs bg-bg-elev border border-border rounded px-2 py-1 text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
        />
        <input
          type="text"
          placeholder="Filter by workflowId…"
          value={workflowFilter}
          onChange={(e) => setWorkflowFilter(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
          className="flex-1 text-xs bg-bg-elev border border-border rounded px-2 py-1 text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={applyFilters}
          className="text-xs bg-accent text-white px-3 py-1 rounded hover:bg-accent/90 transition-colors"
        >
          Filter
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto">
        {events.length === 0 && !loading && (
          <div className="flex items-center justify-center h-32 text-sm text-fg-muted">
            No audit events
          </div>
        )}

        <div className="divide-y divide-border">
          {events.map((evt) => (
            <div key={evt.id} className="px-4 py-2">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => toggleExpand(evt.id)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-accent font-medium">{evt.action}</span>
                  <span className="text-[11px] text-fg-subtle">{formatRelative(evt.timestamp)}</span>
                  {evt.actor && (
                    <span className="text-[11px] text-fg-muted">{evt.actor}</span>
                  )}
                  {evt.targetKind && evt.targetId && (
                    <span className="text-[11px] text-fg-subtle">
                      {evt.targetKind}/{evt.targetId.slice(0, 8)}
                    </span>
                  )}
                  {evt.detail !== undefined && (
                    <span className="text-[10px] text-fg-subtle ml-auto">
                      {expandedIds.has(evt.id) ? "▴" : "▾"}
                    </span>
                  )}
                </div>
              </button>

              {expandedIds.has(evt.id) && evt.detail !== undefined && (
                <pre className="mt-1 text-[11px] text-fg-muted bg-bg-elev rounded p-2 overflow-x-auto">
                  {JSON.stringify(evt.detail, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>

        <div ref={sentinelRef} className="h-8 flex items-center justify-center">
          {loading && <Spinner size="sm" />}
          {done && events.length > 0 && (
            <span className="text-[11px] text-fg-subtle">End of audit log</span>
          )}
        </div>
      </div>
    </div>
  );
}
