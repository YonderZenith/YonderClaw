import { PanelShell } from "./PanelShell";
import type { PanelProps } from "./types";

export function MetricSeries({ config, data, theme }: PanelProps) {
  const series = Array.isArray(data) ? data.map(Number).filter(Number.isFinite) : [];
  if (series.length < 2) {
    return (
      <PanelShell config={config}>
        <div className="panel-empty">No series data yet.</div>
      </PanelShell>
    );
  }
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = Math.max(1, max - min);
  const w = 160;
  const h = 48;
  const step = w / (series.length - 1);
  const pts = series
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(" ");
  const stroke = config.color || theme.primary;
  const latest = series[series.length - 1];
  return (
    <PanelShell config={config}>
      <svg width={w} height={h} role="img" aria-label={`${config.title} sparkline`}>
        <polyline points={pts} fill="none" stroke={stroke} strokeWidth={2} />
      </svg>
      <div className="series-latest">latest: <strong>{latest}</strong></div>
    </PanelShell>
  );
}
