import { create } from "zustand";
import type { Alert } from "../domain/types";
import { listAlerts } from "../transport/rest";

interface AlertState {
  alerts: Alert[];
  loading: boolean;
  unreadCount: number;
  loadAlerts: () => Promise<void>;
  markRead: (alertId: string) => void;
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

  async loadAlerts() {
    if (get().loading) return;
    set({ loading: true });
    try {
      const alerts = await listAlerts();
      set({ alerts, loading: false, unreadCount: countUnread(alerts) });
    } catch {
      set({ loading: false });
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
