// Decides what to spawn in the PTY. Priority matches launch.bat exactly:
//   1. claude --resume <id>   (data/session-id.txt, Rust-side shape-validated)
//   2. claude --continue      (any prior session in this project dir)
//   3. fresh claude           (first run, no history)
//
// Step 2 is detected frontend-side as "sessionId is null but the user has used
// this agent before" — the user chooses by hitting Enter on the prompt. We
// default to --resume-first and never silently pick --continue without the user
// seeing the mode in the UI.

import { findClaude, hasAnySession, readSessionId, readSkipPermissions } from "./tauri";
import type { LaunchMode } from "../store";

export async function resolveLaunch(projectDir: string): Promise<{
  claudePath: string;
  args: string[];
  sessionId: string | null;
  mode: LaunchMode;
}> {
  const claudePath = await findClaude();
  const sessionId = await readSessionId(projectDir);
  const skipPerms = await readSkipPermissions(projectDir);
  const skipFlag = skipPerms ? ["--dangerously-skip-permissions"] : [];

  if (sessionId) {
    return {
      claudePath,
      args: ["--resume", sessionId, ...skipFlag],
      sessionId,
      mode: "resume",
    };
  }

  // No captured session id — check whether *any* prior session exists for this
  // project. `claude --continue` errors out if there's no history, so on first
  // launch we must spawn bare `claude` instead.
  const hasHistory = await hasAnySession(projectDir);
  if (hasHistory) {
    return {
      claudePath,
      args: ["--continue", ...skipFlag],
      sessionId: null,
      mode: "continue",
    };
  }

  return {
    claudePath,
    args: [...skipFlag],
    sessionId: null,
    mode: "fresh",
  };
}
