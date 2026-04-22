import { PanelShell } from "./PanelShell";
import type { PanelProps } from "./types";

export function KpiCard({ config, data }: PanelProps) {
  const opts = (config.config ?? {}) as { unit?: string; format?: "int" | "float" | "pct" };
  const n = typeof data === "number" ? data : Number(data);
  const display =
    Number.isFinite(n)
      ? opts.format === "pct"
        ? `${(n * 100).toFixed(1)}%`
        : opts.format === "float"
          ? n.toFixed(2)
          : Math.round(n).toLocaleString()
      : "—";
  return (
    <PanelShell config={config}>
      <div className="kpi-value">
        {display}
        {opts.unit && <span className="kpi-unit"> {opts.unit}</span>}
      </div>
      {config.description && <div className="kpi-desc">{config.description}</div>}
    </PanelShell>
  );
}
