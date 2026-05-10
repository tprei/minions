import { create } from "zustand";
import type { SseConnectionState } from "../transport/types";

interface ConnectionState {
  state: SseConnectionState;
  lastEventAt: string | undefined;
  currentWorkflowId: string | undefined;
  setState: (s: SseConnectionState) => void;
  setLastEventAt: (ts: string) => void;
  setCurrentWorkflowId: (id: string) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  state: "idle",
  lastEventAt: undefined,
  currentWorkflowId: undefined,

  setState(s) {
    set({ state: s });
  },

  setLastEventAt(ts) {
    set({ lastEventAt: ts });
  },

  setCurrentWorkflowId(id) {
    set({ currentWorkflowId: id });
  },
}));
