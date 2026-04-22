import { PanelShell } from "./PanelShell";
import type { PanelProps } from "./types";

interface Node { id: string; label?: string; kind?: string; online?: boolean }

export function NetworkViz({ config, data, theme }: PanelProps) {
  const nodes: Node[] = Array.isArray(data) ? (data as Node[]) : [];
  if (nodes.length === 0) {
    return (
      <PanelShell config={config}>
        <div className="panel-empty">No peers yet.</div>
      </PanelShell>
    );
  }
  const size = 140;
  const center = size / 2;
  const radius = size / 2 - 12;
  const accent = config.color || theme.primary;
  return (
    <PanelShell config={config}>
      <svg width={size} height={size} role="img" aria-label={`${config.title} peer network`}>
        <circle cx={center} cy={center} r={6} fill={accent} />
        {nodes.map((n, i) => {
          const theta = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
          const x = center + Math.cos(theta) * radius;
          const y = center + Math.sin(theta) * radius;
          const fill = n.online === false ? theme.muted || "#666" : theme.success || accent;
          return (
            <g key={n.id}>
              <line x1={center} y1={center} x2={x} y2={y} stroke={theme.muted || "#333"} strokeWidth={1} />
              <circle cx={x} cy={y} r={5} fill={fill} />
              {n.label && <title>{n.label}</title>}
            </g>
          );
        })}
      </svg>
      <div className="net-count">{nodes.length} peer{nodes.length === 1 ? "" : "s"}</div>
    </PanelShell>
  );
}
