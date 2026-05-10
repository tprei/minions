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

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  loading: false,
  unreadCount: 0,

  async loadAlerts() {
    if (get().loading) return;
    set({ loading: true });
    try {
      const alerts = await listAlerts();
      set({ alerts, loading: false, unreadCount: alerts.length });
    } catch {
      set({ loading: false });
    }
  },

  markRead(alertId) {
    set((s) => {
      const idx = s.alerts.findIndex((a) => a.id === alertId);
      if (idx === -1) return s;
      return { unreadCount: Math.max(0, s.unreadCount - 1) };
    });
  },
}));
