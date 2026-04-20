import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";

export function Bootstrap() {
  const setProject = useStore((s) => s.setProject);

  async function pick() {
    const picked = await open({ directory: true, multiple: false, title: "Pick your YonderClaw agent directory" });
    if (typeof picked === "string" && picked.length > 0) {
      setProject(picked);
    }
  }

  return (
    <div className="bootstrap">
      <h2>YonderClaw</h2>
      <p>
        Pick the agent project directory the installer created (contains{" "}
        <code>CLAUDE.md</code>, <code>data/</code>, <code>scripts/</code>). We'll
        resume your Claude session inside and stream the live dashboard alongside.
      </p>
      <button onClick={pick}>Choose agent directory</button>
      <div className="hint">
        When the installer launches the desktop, it sets the{" "}
        <code>YONDERCLAW_PROJECT_DIR</code> environment variable so this picker
        is skipped. You'll only see this screen if you opened YonderClaw
        directly without that env set.
      </div>
    </div>
  );
}
