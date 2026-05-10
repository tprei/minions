import { create } from "zustand";
import type { AuditEvent } from "../domain/types";
import { listAuditEvents } from "../transport/rest";

interface AuditState {
  events: AuditEvent[];
  cursor: string | undefined;
  loading: boolean;
  done: boolean;
  loadInitial: () => Promise<void>;
  loadMore: () => Promise<void>;
}

export const useAuditStore = create<AuditState>((set, get) => ({
  events: [],
  cursor: undefined,
  loading: false,
  done: false,

  async loadInitial() {
    if (get().loading) return;
    set({ loading: true });
    try {
      const events = await listAuditEvents({ limit: 50 });
      const cursor = events.length > 0 ? events[events.length - 1]!.timestamp : undefined;
      set({ events, cursor, loading: false, done: events.length < 50 });
    } catch {
      set({ loading: false });
    }
  },

  async loadMore() {
    const { loading, done, cursor } = get();
    if (loading || done) return;
    set({ loading: true });
    try {
      const next = await listAuditEvents({ limit: 50, beforeTs: cursor });
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
