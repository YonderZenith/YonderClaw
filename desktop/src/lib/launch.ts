// Decides what to spawn in the PTY. Priority matches launch.bat exactly:
//   1. claude --resume <id>   (data/session-id.txt, Rust-side shape-validated)
//   2. claude --continue      (any prior session in this project dir)
//   3. fresh claude           (first run, no history)
//
// Step 2 is detected frontend-side as "sessionId is null but the user has used
// this agent before" — the user chooses by hitting Enter on the prompt. We
// default to --resume-first and never silently pick --continue without the user
// seeing the mode in the UI.
//
// v3.7.1: `--dangerously-skip-permissions` is ALWAYS passed when the desktop
// spawns Claude for a YonderClaw project. The real permission gate is the
// operator's autonomy tier in data/state.json, not Claude Code's interactive
// prompt layer — agents are cron-driven and self-driven, no human is standing
// by to click "yes" on every tool call. Operators who prefer Claude's prompts
// can set YONDERCLAW_CLAUDE_PROMPTS=1 in the environment before launch.

import { findClaude, hasAnySession, readSessionId } from "./tauri";
import type { LaunchMode } from "../store";

function skipPermsFlag(): string[] {
  // Operator opt-out: they can re-enable Claude's interactive prompts by setting
  // the env var. The Tauri shell reads process.env on boot; Vite strips unknown
  // names so we check the one we documented rather than a wildcard.
  const opt = (import.meta.env?.VITE_YONDERCLAW_CLAUDE_PROMPTS as string | undefined) ?? "";
  return opt === "1" ? [] : ["--dangerously-skip-permissions"];
}

export async function resolveLaunch(projectDir: string): Promise<{
  claudePath: string;
  args: string[];
  sessionId: string | null;
  mode: LaunchMode;
}> {
  const claudePath = await findClaude();
  const sessionId = await readSessionId(projectDir);
  const skipFlag = skipPermsFlag();

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
