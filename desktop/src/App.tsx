import { useEffect } from "react";
import { Terminal } from "./components/Terminal";
import { LayoutFrame } from "./components/LayoutFrame";
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
  const brandAgentName = useStore((s) => s.dashboardConfig.brand.agentName);

  useEffect(() => {
    if (projectDir) return;
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

  // Prefer Board-authored agent name from dashboard-config.json; fall back to
  // the project folder name if the config hasn't loaded yet.
  const folderName = projectDir.split(/[\\/]/).pop() ?? "agent";
  const displayAgent =
    brandAgentName && brandAgentName !== "YonderClaw Agent"
      ? brandAgentName
      : folderName;

  return (
    <div className="app">
      <TopBar
        agent={displayAgent}
        mode={launchMode}
        sessionId={sessionId}
        status={ptyStatus}
      />
      <LayoutFrame>
        <Terminal />
      </LayoutFrame>
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
