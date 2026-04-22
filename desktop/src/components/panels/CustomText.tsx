import { PanelShell } from "./PanelShell";
import type { PanelProps } from "./types";

export function CustomText({ config, data }: PanelProps) {
  const opts = (config.config ?? {}) as { body?: string };
  // Body can come from dataKey (live) or be baked into config.body (static).
  const body = typeof data === "string" ? data : opts.body ?? config.description ?? "";
  if (!body) {
    return (
      <PanelShell config={config}>
        <div className="panel-empty">No content.</div>
      </PanelShell>
    );
  }
  return (
    <PanelShell config={config}>
      <div className="custom-text">
        {body.split("\n").map((line, i) => <p key={i}>{line}</p>)}
      </div>
    </PanelShell>
  );
}
