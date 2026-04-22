import type { ComponentType } from "react";
import type { PanelType } from "../../lib/dashboard-config";
import type { PanelProps } from "./types";
import { KpiCard } from "./KpiCard";
import { MetricSeries } from "./MetricSeries";
import { ActivityFeed } from "./ActivityFeed";
import { StatGrid } from "./StatGrid";
import { NetworkViz } from "./NetworkViz";
import { Timeline } from "./Timeline";
import { StatusList } from "./StatusList";
import { ProgressBar } from "./ProgressBar";
import { CustomText } from "./CustomText";

export const PANEL_REGISTRY: Record<PanelType, ComponentType<PanelProps>> = {
  "kpi-card": KpiCard,
  "metric-series": MetricSeries,
  "activity-feed": ActivityFeed,
  "stat-grid": StatGrid,
  "network-viz": NetworkViz,
  "timeline": Timeline,
  "status-list": StatusList,
  "progress-bar": ProgressBar,
  "custom-text": CustomText,
};

export type { PanelProps } from "./types";
