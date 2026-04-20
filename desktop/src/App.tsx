import { useEffect } from "react";
import { Terminal } from "./components/Terminal";
import { DashboardPanel } from "./components/DashboardPanel";
import { Bootstrap } from "./components/Bootstrap";
import { useStore } from "./store";
import { getProjectDir } from "./lib/tauri";
import yzLogo from "./assets/yz-logo.png";

export default function App() {
  const projectDir = useStore((s) => s.projectDir);
  const setProject = useStore((s) => s.setProject);
  const launchMode = useStore((s) => s.launchMode);
  const sessionId = useStore((s) => s.sessionId);
  const ptyStatus = useStore((s) => s.ptyStatus);

  useEffect(() => {
    if (projectDir) return;
    // Primary: YONDERCLAW_PROJECT_DIR env var set by the installer when it
    // launches the desktop binary. Frontend trusts Rust's validation.
    getProjectDir()
      .then((dir) => { if (dir) setProject(dir); })
      .catch(() => { /* stand-alone launch — fall through to picker */ });
  }, [projectDir, setProject]);

  if (!projectDir) {
    return (
      <div className="app">
        <TopBar agent={null} />
        <Bootstrap />
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar
        agent={projectDir.split(/[\\/]/).pop() ?? "agent"}
        mode={launchMode}
        sessionId={sessionId}
        status={ptyStatus}
      />
      <div className="split">
        <div className="pane">
          <div className="pane-header">Claude</div>
          <div className="pane-body pane-body-term"><Terminal /></div>
        </div>
        <div className="pane">
          <div className="pane-header">Dashboard</div>
          <div className="pane-body"><DashboardPanel /></div>
        </div>
      </div>
    </div>
  );
}

function TopBar(props: {
  agent: string | null;
  mode?: string | null;
  sessionId?: string | null;
  status?: string;
}) {
  const dotClass =
    props.status === "running" ? "ok" :
    props.status === "exited" || props.status === "error" ? "off" :
    "stale";
  return (
    <div className="topbar">
      <div className="brand-block">
        <img src={yzLogo} alt="YZ" className="brand-logo" />
        <span className="brand">YonderClaw</span>
        <span className="brand-by">by Yonder Zenith</span>
        {props.agent && <span className="agent-name">· {props.agent}</span>}
      </div>
      <div>
        <span className={`status-dot ${dotClass}`} />
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
          {props.mode ?? ""}{props.sessionId ? ` · ${props.sessionId.slice(0, 8)}…` : ""}
          {props.status ? ` · ${props.status}` : ""}
        </span>
      </div>
    </div>
  );
}
