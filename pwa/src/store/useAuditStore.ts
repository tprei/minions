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
  loadInitial: (filters?: AuditFilters) => Promise<void>;
  loadMore: () => Promise<void>;
}

export const useAuditStore = create<AuditState>((set, get) => ({
  events: [],
  cursor: undefined,
  loading: false,
  done: false,
  filters: {},

  async loadInitial(filters?: AuditFilters) {
    if (get().loading) return;
    const nextFilters = filters ?? get().filters;
    set({ loading: true, filters: nextFilters });
    try {
      const events = await listAuditEvents({ limit: 50, ...nextFilters });
      const cursor = events.length > 0 ? events[events.length - 1]!.timestamp : undefined;
      set({ events, cursor, loading: false, done: events.length < 50 });
    } catch {
      set({ loading: false });
    }
  },

  async loadMore() {
    const { loading, done, cursor, filters } = get();
    if (loading || done) return;
    set({ loading: true });
    try {
      const next = await listAuditEvents({ limit: 50, beforeTs: cursor, ...filters });
      const newCursor = next.length > 0 ? next[next.length - 1]!.timestamp : cursor;
      set((s) => ({
        events: [...s.events, ...next],
        cursor: newCursor,
        loading: false,
        done: next.length < 50,
      }));
    } catch {
      set({ loading: false });
    }
  },
}));
