import { PanelShell } from "./PanelShell";
import type { PanelProps } from "./types";

export function ProgressBar({ config, data, theme }: PanelProps) {
  const opts = (config.config ?? {}) as { max?: number; unit?: string };
  let value: number;
  let max = opts.max ?? 1;
  if (typeof data === "number") {
    value = data;
  } else if (data && typeof data === "object") {
    const obj = data as { value?: unknown; max?: unknown };
    value = Number(obj.value ?? 0);
    if (typeof obj.max === "number") max = obj.max;
  } else {
    value = Number(data ?? 0);
  }
  if (!Number.isFinite(value)) value = 0;
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const fill = config.color || theme.primary;
  return (
    <PanelShell config={config}>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${(pct * 100).toFixed(1)}%`, background: fill }} />
      </div>
      <div className="progress-label">
        {value.toLocaleString()}{opts.unit ? ` ${opts.unit}` : ""} / {max.toLocaleString()} ({(pct * 100).toFixed(0)}%)
      </div>
    </PanelShell>
  );
}
