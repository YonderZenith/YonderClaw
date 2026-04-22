import { useEffect } from "react";
import { onDashboardUpdate, onDashboardConfigUpdate, watchProject } from "../lib/tauri";
import { useStore, type DashboardData } from "../store";
import type { DashboardConfig, DashboardTheme, PanelConfig, PanelPosition } from "../lib/dashboard-config";
import { readDataKey } from "../lib/dashboard-config";
import { PANEL_REGISTRY } from "./panels";
import type { ReactNode } from "react";

// LayoutFrame wraps the Claude terminal with configured dashboard panels
// arranged in top/right/bottom bands. Panels are driven entirely by
// data/dashboard-config.json, which the Commissioning Board writes at
// install time (and which agents can hand-edit after). The file watcher
// pushes both config updates and live metric updates to this component.

export function LayoutFrame({ children }: { children: ReactNode }) {
  const projectDir = useStore((s) => s.projectDir);
  const config = useStore((s) => s.dashboardConfig);
  const setConfig = useStore((s) => s.setDashboardConfig);
  const dashboard = useStore((s) => s.dashboard);
  const setDashboard = useStore((s) => s.setDashboard);
  const configError = useStore((s) => s.dashboardConfigError);

  useEffect(() => {
    if (!projectDir) return;
    let unlistenData: (() => void) | null = null;
    let unlistenCfg: (() => void) | null = null;

    (async () => {
      unlistenData = await onDashboardUpdate((raw) => {
        try {
          setDashboard(JSON.parse(raw) as DashboardData, null);
        } catch (e) {
          setDashboard(null, e instanceof Error ? e.message : String(e));
        }
      });
      unlistenCfg = await onDashboardConfigUpdate((raw) => {
        try {
          setConfig(JSON.parse(raw) as DashboardConfig, null);
        } catch (e) {
          setConfig(null, e instanceof Error ? e.message : String(e));
        }
      });
      try {
        await watchProject(projectDir);
      } catch (e) {
        setDashboard(null, e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      if (unlistenData) unlistenData();
      if (unlistenCfg) unlistenCfg();
    };
  }, [projectDir, setDashboard, setConfig]);

  useEffect(() => { applyTheme(config.theme); }, [config.theme]);

  const bands = groupByPosition(config.panels);

  return (
    <div className="workspace">
      {bands.top.length > 0 && (
        <PanelBand orientation="row" panels={bands.top} dashboard={dashboard} theme={config.theme} />
      )}
      <div className="workspace-main">
        <div className="workspace-term">{children}</div>
        {bands.right.length > 0 && (
          <PanelBand orientation="column" panels={bands.right} dashboard={dashboard} theme={config.theme} />
        )}
      </div>
      {bands.bottom.length > 0 && (
        <PanelBand orientation="row" panels={bands.bottom} dashboard={dashboard} theme={config.theme} />
      )}
      {configError && (
        <div className="config-error" role="alert">
          dashboard-config.json parse error: {configError}
        </div>
      )}
    </div>
  );
}

function groupByPosition(panels: PanelConfig[]): Record<PanelPosition, PanelConfig[]> {
  const buckets: Record<PanelPosition, PanelConfig[]> = { top: [], right: [], bottom: [] };
  for (const p of panels) buckets[p.position].push(p);
  (Object.keys(buckets) as PanelPosition[]).forEach((k) => {
    buckets[k].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  });
  return buckets;
}

function PanelBand({ orientation, panels, dashboard, theme }: {
  orientation: "row" | "column";
  panels: PanelConfig[];
  dashboard: DashboardData | null;
  theme: DashboardTheme;
}) {
  return (
    <div className={`panel-band panel-band-${orientation}`}>
      {panels.map((p) => {
        const Component = PANEL_REGISTRY[p.type];
        if (!Component) return null;
        const data = readDataKey(dashboard, p.dataKey);
        return <Component key={p.id} config={p} data={data} theme={theme} />;
      })}
    </div>
  );
}

function applyTheme(t: DashboardTheme) {
  const root = document.documentElement;
  const set = (name: string, value: string | undefined) => {
    if (value) root.style.setProperty(name, value);
  };
  set("--accent", t.primary);
  set("--accent-dim", t.secondary);
  set("--bg", t.background);
  set("--bg-elevated", t.surface);
  set("--text", t.text);
  set("--text-muted", t.muted);
  set("--good", t.success);
  set("--warn", t.warn);
  set("--bad", t.error);
  set("--panel-radius", t.radius);
  set("--font-family", t.fontFamily);
}
