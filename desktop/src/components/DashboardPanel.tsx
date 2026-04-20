import { useEffect } from "react";
import { onDashboardUpdate, watchProject } from "../lib/tauri";
import { useStore, type DashboardData } from "../store";
import yzLogo from "../assets/yz-logo.png";

export function DashboardPanel() {
  const projectDir = useStore((s) => s.projectDir);
  const dashboard = useStore((s) => s.dashboard);
  const rawError = useStore((s) => s.dashboardRawError);
  const setDashboard = useStore((s) => s.setDashboard);

  useEffect(() => {
    if (!projectDir) return;
    let unlisten: (() => void) | null = null;

    (async () => {
      unlisten = await onDashboardUpdate((raw) => {
        try {
          const parsed = JSON.parse(raw) as DashboardData;
          setDashboard(parsed, null);
        } catch (e) {
          setDashboard(null, e instanceof Error ? e.message : String(e));
        }
      });
      try {
        await watchProject(projectDir);
      } catch (e) {
        setDashboard(null, e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [projectDir, setDashboard]);

  if (!dashboard && !rawError) {
    return (
      <div className="dash dash-empty">
        Waiting for <code>data/dashboard.json</code>…
      </div>
    );
  }

  if (rawError) {
    return (
      <div className="dash">
        <div className="card">
          <h3>Dashboard parse error</h3>
          <div className="err">{rawError}</div>
        </div>
      </div>
    );
  }

  const d = dashboard!;
  const stats = d.stats ?? {};
  const status = d.status ?? {};

  return (
    <div className="dash">
      <div className="dash-brand">
        <img src={yzLogo} alt="YZ" className="dash-brand-logo" />
        <div className="dash-brand-text">
          <div className="dash-brand-title">YonderClaw</div>
          <div className="dash-brand-sub">by Yonder Zenith</div>
        </div>
      </div>
      {d.agent?.name && (
        <div className="card">
          <h3>Agent</h3>
          <div className="stat-row">
            <span className="stat-label">Name</span>
            <span className="stat-val">{d.agent.name}</span>
          </div>
          {d.identity?.role && (
            <div className="stat-row">
              <span className="stat-label">Role</span>
              <span className="stat-val">{d.identity.role}</span>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3>Status</h3>
        <div className="stat-row">
          <span className="stat-label">Online</span>
          <span className="stat-val">{status.online ? "yes" : "—"}</span>
        </div>
        {status.last_seen_iso && (
          <div className="stat-row">
            <span className="stat-label">Last seen</span>
            <span className="stat-val">{status.last_seen_iso}</span>
          </div>
        )}
        {typeof status.pending_tasks === "number" && (
          <div className="stat-row">
            <span className="stat-label">Pending tasks</span>
            <span className="stat-val">{status.pending_tasks}</span>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Activity</h3>
        {typeof stats.actions_taken === "number" && (
          <div className="stat-row">
            <span className="stat-label">Actions taken</span>
            <span className="stat-val">{stats.actions_taken}</span>
          </div>
        )}
        {typeof stats.succeeded === "number" && (
          <div className="stat-row">
            <span className="stat-label">Succeeded</span>
            <span className="stat-val">{stats.succeeded}</span>
          </div>
        )}
        {typeof stats.failed === "number" && (
          <div className="stat-row">
            <span className="stat-label">Failed</span>
            <span className="stat-val">{stats.failed}</span>
          </div>
        )}
        {stats.last_action_iso && (
          <div className="stat-row">
            <span className="stat-label">Last action</span>
            <span className="stat-val">{stats.last_action_iso}</span>
          </div>
        )}
      </div>
    </div>
  );
}
