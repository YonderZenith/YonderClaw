/**
 * Dashboard-config writer (v3.7.2)
 *
 * Translates the Commissioning Board's DashboardPanel[] (from research.ts)
 * into the v3.7.2 DashboardConfig shape that the Tauri UI's LayoutFrame
 * reads from data/dashboard-config.json.
 *
 * If the Board produced no panels, we fall back to a per-claw-type default
 * loaded from installer/templates/dashboard-defaults/<template>.json (Phase 5).
 *
 * The shape here MUST stay in lockstep with desktop/src/lib/dashboard-config.ts.
 * We don't import from desktop/ because this runs at install time under tsx,
 * outside the Tauri build. Instead the shape is duplicated and the fields
 * that matter get written out as a plain JSON file.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { ClawConfig, DashboardPanel } from "./research.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS_DIR = path.join(__dirname, "templates", "dashboard-defaults");

type NewPanelType =
  | "kpi-card" | "metric-series" | "activity-feed" | "stat-grid"
  | "network-viz" | "timeline" | "status-list" | "progress-bar" | "custom-text";

type NewPanel = {
  id: string;
  type: NewPanelType;
  title: string;
  position: "top" | "right" | "bottom";
  dataKey?: string;
  config?: Record<string, unknown>;
  priority?: number;
  color?: string;
  description?: string;
};

type NewTheme = {
  primary: string;
  secondary?: string;
  background?: string;
  surface?: string;
  text?: string;
  muted?: string;
  success?: string;
  warn?: string;
  error?: string;
  radius?: string;
  fontFamily?: string;
};

type NewDashboardConfig = {
  version: 1;
  theme: NewTheme;
  brand: { agentName: string; tagline?: string };
  panels: NewPanel[];
  meta?: { generatedBy?: "board" | "template" | "hand-edit"; generatedAt?: string; clawType?: string };
};

// Per-claw default accent. Keeps each agent's UI visibly distinct even when
// the Board is skipped. Agents can override post-install.
const THEME_BY_TEMPLATE: Record<string, NewTheme> = {
  outreach:  { primary: "#6ee7ff", secondary: "#38bdf8", success: "#4ade80", warn: "#fbbf24", error: "#f87171", background: "#0b0d12", surface: "#151923", text: "#e8ecf1", muted: "#7a8699", radius: "10px" },
  research:  { primary: "#c084fc", secondary: "#a855f7", success: "#4ade80", warn: "#fbbf24", error: "#f87171", background: "#0b0b14", surface: "#16141f", text: "#ece5f5", muted: "#7c738e", radius: "10px" },
  support:   { primary: "#4ade80", secondary: "#10b981", success: "#4ade80", warn: "#fbbf24", error: "#f87171", background: "#091211", surface: "#13201d", text: "#e5f5ed", muted: "#6a8a80", radius: "10px" },
  social:    { primary: "#fb923c", secondary: "#f97316", success: "#4ade80", warn: "#fbbf24", error: "#f87171", background: "#120d08", surface: "#1f1813", text: "#f5ede5", muted: "#8a7a6a", radius: "10px" },
  custom:    { primary: "#f5c518", secondary: "#eab308", success: "#4ade80", warn: "#fbbf24", error: "#f87171", background: "#0b0d12", surface: "#151923", text: "#e8ecf1", muted: "#7a8699", radius: "10px" },
};

// Board emits type strings from its 5-option list. Map to the v3.7.2 registry.
const TYPE_MAP: Record<DashboardPanel["type"], NewPanelType> = {
  kpi: "kpi-card",
  feed: "activity-feed",
  table: "stat-grid",
  health: "status-list",
  custom: "custom-text",
};

// Board colors come as CSS var references ("var(--cyan)"). Translate to hex
// so the v3.7.2 panel palette doesn't depend on the legacy dashboard.html
// stylesheet variables.
const COLOR_MAP: Record<string, string> = {
  "var(--cyan)":   "#00beea",
  "var(--green)":  "#10b981",
  "var(--purple)": "#8b5cf6",
  "var(--gold)":   "#f59e0b",
  "var(--red)":    "#ef4444",
};

function translateBoardPanel(p: DashboardPanel, idx: number): NewPanel {
  const newType = TYPE_MAP[p.type] ?? "custom-text";
  const color = p.color ? (COLOR_MAP[p.color] ?? p.color) : undefined;
  // KPIs go in the top strip; everything else stacks in the right column.
  // Bottom band is reserved for agent-authored additions.
  const position: NewPanel["position"] = p.type === "kpi" ? "top" : "right";
  return {
    id: p.id || `panel-${idx}`,
    type: newType,
    title: p.title,
    position,
    dataKey: p.dataKey || p.dataSource || undefined,
    priority: p.priority ?? (idx + 1) * 10,
    color,
    description: p.description,
  };
}

function loadTemplateDefault(template: string): NewPanel[] {
  const file = path.join(DEFAULTS_DIR, `${template}.json`);
  if (!fs.existsSync(file)) {
    // Custom / unknown — try custom.json, then return minimal
    const fallback = path.join(DEFAULTS_DIR, "custom.json");
    if (fs.existsSync(fallback)) {
      try { return JSON.parse(fs.readFileSync(fallback, "utf-8")).panels as NewPanel[]; }
      catch { /* fall through */ }
    }
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return (parsed.panels as NewPanel[]) ?? [];
  } catch {
    return [];
  }
}

export function buildDashboardConfig(config: ClawConfig): NewDashboardConfig {
  const boardPanels = config.dashboardPanels ?? [];
  const usingBoard = boardPanels.length > 0;
  const panels: NewPanel[] = usingBoard
    ? boardPanels.map(translateBoardPanel)
    : loadTemplateDefault(config.template);

  const theme = THEME_BY_TEMPLATE[config.template] ?? THEME_BY_TEMPLATE.custom;

  return {
    version: 1,
    theme,
    brand: {
      agentName: config.name,
      tagline: config.missionStatement?.slice(0, 120),
    },
    panels,
    meta: {
      generatedBy: usingBoard ? "board" : "template",
      generatedAt: new Date().toISOString(),
      clawType: config.template,
    },
  };
}

export function writeDashboardConfig(projectDir: string, config: ClawConfig): string {
  const cfg = buildDashboardConfig(config);
  const dataDir = path.join(projectDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const outPath = path.join(dataDir, "dashboard-config.json");
  fs.writeFileSync(outPath, JSON.stringify(cfg, null, 2) + "\n");
  return outPath;
}
