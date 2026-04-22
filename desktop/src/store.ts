import { create } from "zustand";
import type { DashboardConfig } from "./lib/dashboard-config";
import { DEFAULT_DASHBOARD_CONFIG } from "./lib/dashboard-config";

export type LaunchMode = "resume" | "continue" | "fresh";

export interface DashboardData {
  agent?: { name?: string };
  identity?: { role?: string };
  status?: {
    online?: boolean;
    last_seen_iso?: string;
    pending_tasks?: number;
  };
  stats?: {
    actions_taken?: number;
    succeeded?: number;
    failed?: number;
    last_action_iso?: string;
  };
  [k: string]: unknown;
}

interface State {
  projectDir: string | null;
  claudePath: string | null;
  sessionId: string | null;
  launchMode: LaunchMode | null;
  dashboard: DashboardData | null;
  dashboardRawError: string | null;
  dashboardConfig: DashboardConfig;
  dashboardConfigError: string | null;
  ptyStatus: "idle" | "spawning" | "running" | "exited" | "error";
  ptyError: string | null;

  setProject: (dir: string) => void;
  setClaudePath: (p: string | null) => void;
  setSession: (id: string | null, mode: LaunchMode) => void;
  setDashboard: (d: DashboardData | null, err?: string | null) => void;
  setDashboardConfig: (c: DashboardConfig | null, err?: string | null) => void;
  setPty: (s: State["ptyStatus"], err?: string | null) => void;
}

export const useStore = create<State>((set) => ({
  projectDir: null,
  claudePath: null,
  sessionId: null,
  launchMode: null,
  dashboard: null,
  dashboardRawError: null,
  dashboardConfig: DEFAULT_DASHBOARD_CONFIG,
  dashboardConfigError: null,
  ptyStatus: "idle",
  ptyError: null,

  setProject: (dir) => set({ projectDir: dir }),
  setClaudePath: (p) => set({ claudePath: p }),
  setSession: (id, mode) => set({ sessionId: id, launchMode: mode }),
  setDashboard: (d, err = null) => set({ dashboard: d, dashboardRawError: err }),
  setDashboardConfig: (c, err = null) => set({
    dashboardConfig: c ?? DEFAULT_DASHBOARD_CONFIG,
    dashboardConfigError: err,
  }),
  setPty: (s, err = null) => set({ ptyStatus: s, ptyError: err }),
}));
