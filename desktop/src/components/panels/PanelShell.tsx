import type { ReactNode } from "react";
import type { PanelConfig } from "../../lib/dashboard-config";

export function PanelShell({ config, children }: { config: PanelConfig; children: ReactNode }) {
  const accentStyle = config.color ? { borderTopColor: config.color } : undefined;
  return (
    <div className="panel" style={accentStyle} role="region" aria-label={config.title}>
      <div className="panel-head">
        <span className="panel-title">{config.title}</span>
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}
