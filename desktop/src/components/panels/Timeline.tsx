import { PanelShell } from "./PanelShell";
import type { PanelProps } from "./types";

interface Entry { version?: string; ts?: string; title?: string; note?: string }

export function Timeline({ config, data }: PanelProps) {
  const rows: Entry[] = Array.isArray(data) ? (data as Entry[]) : [];
  if (rows.length === 0) {
    return (
      <PanelShell config={config}>
        <div className="panel-empty">No timeline entries.</div>
      </PanelShell>
    );
  }
  return (
    <PanelShell config={config}>
      <ul className="timeline">
        {rows.map((r, i) => (
          <li key={i} className="timeline-row">
            <div className="timeline-dot" />
            <div className="timeline-body">
              <div className="timeline-head">
                {r.version && <strong>{r.version}</strong>}
                {r.ts && <span className="timeline-ts"> · {r.ts.slice(0, 10)}</span>}
              </div>
              {r.title && <div className="timeline-title">{r.title}</div>}
              {r.note && <div className="timeline-note">{r.note}</div>}
            </div>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}
