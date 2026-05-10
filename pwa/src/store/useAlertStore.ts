import { create } from "zustand";
import type { Alert } from "../domain/types";
import { listAlerts } from "../transport/rest";

interface AlertState {
  alerts: Alert[];
  loading: boolean;
  unreadCount: number;
  error: string | null;
  loadAlerts: () => Promise<void>;
  markRead: (alertId: string) => void;
}

function trunc(msg: string): string {
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
}

function countUnread(alerts: Alert[]): number {
  let n = 0;
  for (const a of alerts) if (a.acknowledgedAt === undefined) n += 1;
  return n;
}

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  loading: false,
  unreadCount: 0,
  error: null,

  async loadAlerts() {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const alerts = await listAlerts();
      set({ alerts, loading: false, unreadCount: countUnread(alerts) });
    } catch (err) {
      set({
        loading: false,
        error: trunc(err instanceof Error ? err.message : "Failed to load alerts"),
      });
    }
  },

  markRead(alertId) {
    set((s) => {
      const idx = s.alerts.findIndex((a) => a.id === alertId);
      if (idx === -1) return s;
      const target = s.alerts[idx]!;
      if (target.acknowledgedAt !== undefined) return s;
      const nextAlerts = s.alerts.slice();
      nextAlerts[idx] = { ...target, acknowledgedAt: new Date().toISOString() };
      return {
        alerts: nextAlerts,
        unreadCount: Math.max(0, s.unreadCount - 1),
      };
    });
  },
}));
