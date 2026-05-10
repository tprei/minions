import { create } from "zustand";
import type { AuditEvent } from "../domain/types";
import { listAuditEvents } from "../transport/rest";

export interface AuditFilters {
  action?: string;
  workflowId?: string;
}

interface AuditState {
  events: AuditEvent[];
  cursor: string | undefined;
  loading: boolean;
  done: boolean;
  filters: AuditFilters;
  error: string | null;
  loadInitial: (filters?: AuditFilters) => Promise<void>;
  loadMore: () => Promise<void>;
}

function trunc(msg: string): string {
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
}

export const useAuditStore = create<AuditState>((set, get) => ({
  events: [],
  cursor: undefined,
  loading: false,
  done: false,
  filters: {},
  error: null,

  async loadInitial(filters?: AuditFilters) {
    if (get().loading) return;
    const nextFilters = filters ?? get().filters;
    set({ loading: true, filters: nextFilters, error: null });
    try {
      const events = await listAuditEvents({ limit: 50, ...nextFilters });
      const cursor = events.length > 0 ? events[events.length - 1]!.timestamp : undefined;
      set({ events, cursor, loading: false, done: events.length < 50 });
    } catch (err) {
      set({
        loading: false,
        error: trunc(err instanceof Error ? err.message : "Failed to load audit events"),
      });
    }
  },

  async loadMore() {
    const { loading, done, cursor, filters } = get();
    if (loading || done) return;
    set({ loading: true, error: null });
    try {
      const next = await listAuditEvents({ limit: 50, beforeTs: cursor, ...filters });
      const newCursor = next.length > 0 ? next[next.length - 1]!.timestamp : cursor;
      set((s) => ({
        events: [...s.events, ...next],
        cursor: newCursor,
        loading: false,
        done: next.length < 50,
      }));
    } catch (err) {
      set({
        loading: false,
        error: trunc(err instanceof Error ? err.message : "Failed to load more events"),
      });
    }
  },
}));
