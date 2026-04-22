import type { PanelConfig, DashboardTheme } from "../../lib/dashboard-config";

export interface PanelProps {
  config: PanelConfig;
  data: unknown;
  theme: DashboardTheme;
}
