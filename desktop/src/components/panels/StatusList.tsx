import { PanelShell } from "./PanelShell";
import type { PanelProps } from "./types";

interface StatusItem { label?: string; status?: "ok" | "warn" | "error" | "idle"; note?: string }

export function StatusList({ config, data, theme }: PanelProps) {
  const items: StatusItem[] = Array.isArray(data) ? (data as StatusItem[]) : [];
  if (items.length === 0) {
    return (
      <PanelShell config={config}>
        <div className="panel-empty">No statuses.</div>
      </PanelShell>
    );
  }
  const colorFor = (s: StatusItem["status"]) => {
    if (s === "ok") return theme.success || "#4ade80";
    if (s === "warn") return theme.warn || "#fbbf24";
    if (s === "error") return theme.error || "#f87171";
    return theme.muted || "#7a8699";
  };
  return (
    <PanelShell config={config}>
      <ul className="status-list">
        {items.map((it, i) => (
          <li key={i} className="status-row">
            <span className="status-pip" style={{ background: colorFor(it.status) }} />
            <span className="status-label">{it.label ?? "—"}</span>
            {it.note && <span className="status-note">{it.note}</span>}
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}
