import { create } from "zustand";

const ROLLING_WINDOW_MS = 60_000;

interface CostSample {
  ts: number;
  cost: number;
}

interface CostState {
  workflowId: string | null;
  samples: CostSample[];
  addSample: (workflowId: string, cost: number) => void;
  clearFor: (workflowId: string) => void;
  rollingRate: () => number;
}

export const useCostStore = create<CostState>((set, get) => ({
  workflowId: null,
  samples: [],

  addSample(workflowId, cost) {
    const now = Date.now();
    set((s) => {
      const cutoff = now - ROLLING_WINDOW_MS;
      const next = s.workflowId === workflowId
        ? [...s.samples.filter((x) => x.ts >= cutoff), { ts: now, cost }]
        : [{ ts: now, cost }];
      return { workflowId, samples: next };
    });
  },

  clearFor(workflowId) {
    set((s) => s.workflowId === workflowId ? { samples: [] } : s);
  },

  rollingRate() {
    const { samples } = get();
    const now = Date.now();
    const cutoff = now - ROLLING_WINDOW_MS;
    const window = samples.filter((x) => x.ts >= cutoff);
    if (window.length === 0) return 0;
    const total = window.reduce((acc, x) => acc + x.cost, 0);
    return total;
  },
}));
