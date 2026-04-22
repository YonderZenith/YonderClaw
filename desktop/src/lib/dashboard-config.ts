// DashboardConfig — the layout+theme+brand contract.
//
// Two-file model:
//   data/dashboard-config.json  → this shape. Board-authored at install,
//                                  agent can hand-edit later. Drives what
//                                  panels exist, where they go, and what
//                                  colors the UI wears.
//   data/dashboard.json         → live metrics (DashboardData in store.ts).
//                                  Agent writes frequently from its heartbeat.
//
// Panels reference live metrics via `dataKey` (dot-path into dashboard.json).

export type PanelType =
  | "kpi-card"        // single big number with delta / unit
  | "metric-series"   // time-series line or spark
  | "activity-feed"   // reverse-chron list of recent events
  | "stat-grid"       // key/value rows (what DashboardPanel v1 did)
  | "network-viz"     // force-graph of connections (claws, peers, etc)
  | "timeline"        // release/version history
  | "status-list"     // checklist / enum statuses
  | "progress-bar"    // 0..1 fraction with label
  | "custom-text";    // markdown / plain paragraph

export type PanelPosition = "top" | "right" | "bottom";

export interface PanelConfig {
  id: string;
  type: PanelType;
  title: string;
  position: PanelPosition;
  // Dot-path into data/dashboard.json. e.g. "stats.actions_taken" reads
  // dashboard.stats.actions_taken. Omit for panels whose data lives inside
  // `config` (custom-text, etc).
  dataKey?: string;
  // Panel-type-specific options (units, thresholds, fields to show, etc).
  config?: Record<string, unknown>;
  // Lower first within its position band. Stable for equal values.
  priority?: number;
  // Client-side refresh hint in ms. File-watch already pushes updates — this
  // is only used by panels that poll derived data.
  refreshInterval?: number;
  // Accent override for this one panel. Falls back to theme.primary.
  color?: string;
  description?: string;
}

export interface DashboardTheme {
  primary: string;
  secondary?: string;
  background?: string;
  surface?: string;
  text?: string;
  muted?: string;
  success?: string;
  warn?: string;
  error?: string;
  fontFamily?: string;
  radius?: string;
}

export interface DashboardBrand {
  agentName: string;
  tagline?: string;
  // platform + platformOwner + YZ logo are enforced by the renderer,
  // NOT read from config. Brand floor — immutable per CT 2026-04-22.
}

export type DashboardConfigMeta = {
  generatedBy?: "board" | "template" | "hand-edit";
  generatedAt?: string;
  clawType?: string;
};

export interface DashboardConfig {
  version: 1;
  theme: DashboardTheme;
  brand: DashboardBrand;
  panels: PanelConfig[];
  meta?: DashboardConfigMeta;
}

// Minimal fallback used when no config file exists yet — matches what
// DashboardPanel v1 used to render, so fresh installs pre-Board still show
// something coherent.
export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  version: 1,
  theme: {
    primary: "#f5c518",
    secondary: "#6ee7ff",
    background: "#0b0d12",
    surface: "#151923",
    text: "#e8ecf1",
    muted: "#7a8699",
    success: "#4ade80",
    warn: "#fbbf24",
    error: "#f87171",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    radius: "10px",
  },
  brand: {
    agentName: "YonderClaw Agent",
  },
  panels: [
    { id: "agent", type: "stat-grid", title: "Agent", position: "right", priority: 10,
      dataKey: "agent", config: { fields: [["name", "Name"], ["role", "Role"]] } },
    { id: "status", type: "stat-grid", title: "Status", position: "right", priority: 20,
      dataKey: "status", config: { fields: [["online", "Online"], ["last_seen_iso", "Last seen"], ["pending_tasks", "Pending tasks"]] } },
    { id: "activity", type: "stat-grid", title: "Activity", position: "right", priority: 30,
      dataKey: "stats", config: { fields: [["actions_taken", "Actions taken"], ["succeeded", "Succeeded"], ["failed", "Failed"], ["last_action_iso", "Last action"]] } },
  ],
  meta: { generatedBy: "template", clawType: "custom" },
};

// Walk a dot-path through the metrics object. "stats.actions_taken" →
// obj.stats.actions_taken. Tolerates missing intermediates.
export function readDataKey(data: unknown, key: string | undefined): unknown {
  if (!key || data == null) return undefined;
  const parts = key.split(".");
  let cur: unknown = data;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}
