import { PanelShell } from "./PanelShell";
import type { PanelProps } from "./types";

type FieldSpec = [string, string] | { key: string; label: string; fmt?: "bool" | "num" };

export function StatGrid({ config, data }: PanelProps) {
  const opts = (config.config ?? {}) as { fields?: FieldSpec[] };
  const fields = opts.fields ?? [];
  const obj = (data && typeof data === "object" ? (data as Record<string, unknown>) : {}) as Record<string, unknown>;
  if (fields.length === 0) {
    return (
      <PanelShell config={config}>
        <div className="panel-empty">No fields configured.</div>
      </PanelShell>
    );
  }
  return (
    <PanelShell config={config}>
      <div className="stat-grid">
        {fields.map((f, i) => {
          const [key, label, fmt] = Array.isArray(f)
            ? [f[0], f[1], undefined as undefined | "bool" | "num"]
            : [f.key, f.label, f.fmt];
          const v = obj[key];
          const display = v == null
            ? "—"
            : fmt === "bool"
              ? v ? "yes" : "no"
              : typeof v === "number"
                ? v.toLocaleString()
                : String(v);
          return (
            <div key={i} className="stat-row">
              <span className="stat-label">{label}</span>
              <span className="stat-val">{display}</span>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}
