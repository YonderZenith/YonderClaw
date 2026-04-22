import { PanelShell } from "./PanelShell";
import type { PanelProps } from "./types";

interface Row { ts?: string; kind?: string; message?: string; ok?: boolean }

export function ActivityFeed({ config, data }: PanelProps) {
  const opts = (config.config ?? {}) as { limit?: number };
  const rows: Row[] = Array.isArray(data) ? (data as Row[]) : [];
  const limit = opts.limit ?? 8;
  const shown = rows.slice(0, limit);
  if (shown.length === 0) {
    return (
      <PanelShell config={config}>
        <div className="panel-empty">No activity yet.</div>
      </PanelShell>
    );
  }
  return (
    <PanelShell config={config}>
      <ul className="feed">
        {shown.map((r, i) => (
          <li key={i} className={`feed-row ${r.ok === false ? "feed-row-err" : ""}`}>
            {r.ts && <span className="feed-ts">{r.ts.slice(11, 19)}</span>}
            {r.kind && <span className="feed-kind">{r.kind}</span>}
            <span className="feed-msg">{r.message ?? ""}</span>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}
