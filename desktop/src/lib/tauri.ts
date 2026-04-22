// Thin typed wrappers around Tauri invoke/listen so the rest of the app doesn't
// care about string keys.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const findClaude = () => invoke<string>("find_claude");
export const getHomeDir = () => invoke<string>("get_home_dir");
export const getProjectDir = () => invoke<string | null>("get_project_dir");
export const readSessionId = (projectDir: string) =>
  invoke<string | null>("read_session_id", { projectDir });
export const hasAnySession = (projectDir: string) =>
  invoke<boolean>("has_any_session", { projectDir });
export const readSkipPermissions = (projectDir: string) =>
  invoke<boolean>("read_skip_permissions", { projectDir });
export const runAutoconnectIfNeeded = (projectDir: string) =>
  invoke<boolean>("run_autoconnect_if_needed", { projectDir });

export const ptySpawn = (args: {
  shell: string;
  args: string[];
  cols: number;
  rows: number;
  cwd: string;
}) => invoke<void>("pty_spawn", args);

export const ptyWrite = (data: string) => invoke<void>("pty_write", { data });
export const ptyResize = (cols: number, rows: number) =>
  invoke<void>("pty_resize", { cols, rows });

export const watchProject = (projectDir: string) =>
  invoke<void>("watch_project", { projectDir });

export async function onDashboardUpdate(cb: (raw: string) => void): Promise<UnlistenFn> {
  return listen<string>("dashboard-updated", (e) => cb(e.payload));
}

export async function onDashboardConfigUpdate(cb: (raw: string) => void): Promise<UnlistenFn> {
  return listen<string>("dashboard-config-updated", (e) => cb(e.payload));
}

export async function onPtyOutput(cb: (chunk: string) => void): Promise<UnlistenFn> {
  return listen<string>("pty-output", (e) => cb(e.payload));
}

export async function onPtyExit(cb: () => void): Promise<UnlistenFn> {
  return listen<void>("pty-exit", () => cb());
}
