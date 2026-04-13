/**
 * YonderClaw System Detection — auto-detect everything about the environment
 */

import { execSync } from "child_process";
import os from "os";
import fs from "fs";
import path from "path";
import { status, muted } from "./brand.js";

export type SystemInfo = {
  os: { platform: string; release: string; arch: string; hostname: string };
  user: { username: string; homedir: string; desktop: string };
  node: { installed: boolean; version: string };
  git: { installed: boolean; version: string };
  claude: { installed: boolean; version: string; authenticated: boolean };
  docker: { installed: boolean; version: string };
  python: { installed: boolean; version: string };
  hardware: { cpus: number; ram: string; gpu: string };
  paths: {
    workspace: string;
    claudeDir: string;
    projectMemory: string;
  };
};

function tryExec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

function getGpuInfo(): string {
  const platform = os.platform();
  if (platform === "win32") {
    const result = tryExec('wmic path win32_VideoController get name /format:list');
    const match = result.match(/Name=(.+)/);
    return match ? match[1].trim() : "Not detected";
  }
  if (platform === "linux") {
    return tryExec("lspci | grep -i vga | head -1 | cut -d: -f3") || "Not detected";
  }
  if (platform === "darwin") {
    return tryExec("system_profiler SPDisplaysDataType | grep 'Chipset Model' | head -1 | cut -d: -f2") || "Not detected";
  }
  return "Not detected";
}

/**
 * Detect everything about the current system.
 */
export function detectSystem(): SystemInfo {
  const platform = os.platform();
  const username = os.userInfo().username;
  const homedir = os.homedir();
  const desktop = path.join(homedir, "Desktop");

  // Encode workspace path for Claude project memory
  const workspacePath = path.join(desktop, "claude-workspace");
  const encodedPath = workspacePath.replace(/[:/\\]/g, "-").replace(/^-/, "");

  const nodeVersion = tryExec("node --version");
  const gitVersion = tryExec("git --version").replace("git version ", "");
  const claudeVersion = tryExec("claude --version") || tryExec(`"${homedir}\\.local\\bin\\claude.exe" --version`);
  const dockerVersion = tryExec("docker --version").replace("Docker version ", "").split(",")[0];
  const pythonVersion = tryExec("python --version").replace("Python ", "") || tryExec("python3 --version").replace("Python ", "");

  const ramGB = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);

  return {
    os: {
      platform: platform === "win32" ? "Windows" : platform === "darwin" ? "macOS" : "Linux",
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
    },
    user: {
      username,
      homedir,
      desktop,
    },
    node: { installed: !!nodeVersion, version: nodeVersion || "Not installed" },
    git: { installed: !!gitVersion, version: gitVersion || "Not installed" },
    claude: {
      installed: !!claudeVersion,
      version: claudeVersion || "Not installed",
      authenticated: fs.existsSync(path.join(homedir, ".claude", ".credentials.json")),
    },
    docker: { installed: !!dockerVersion, version: dockerVersion || "Not installed" },
    python: { installed: !!pythonVersion, version: pythonVersion || "Not installed" },
    hardware: {
      cpus: os.cpus().length,
      ram: `${ramGB} GB`,
      gpu: getGpuInfo(),
    },
    paths: {
      workspace: workspacePath,
      claudeDir: path.join(homedir, ".claude"),
      projectMemory: path.join(homedir, ".claude", "projects", encodedPath),
    },
  };
}

/**
 * Display system detection results.
 */
export function displayDetection(info: SystemInfo): void {
  // OS
  console.log(status.info(`${info.os.platform} ${info.os.release} (${info.os.arch})`));
  console.log(status.info(`User: ${info.user.username} @ ${info.os.hostname}`));
  console.log(status.info(`${info.hardware.cpus} CPUs, ${info.hardware.ram} RAM`));
  if (info.hardware.gpu !== "Not detected") {
    console.log(status.ok(`GPU: ${info.hardware.gpu}`));
  } else {
    console.log(status.warn("GPU: Not detected (will use cloud inference)"));
  }

  console.log("");

  // Required tools only — no Docker/Python clutter
  console.log(info.node.installed ? status.ok(`Node.js ${info.node.version}`) : status.fail("Node.js — not installed"));
  console.log(info.git.installed ? status.ok(`Git ${info.git.version}`) : status.warn("Git — not installed"));
  console.log(info.claude.installed ? status.ok(`Claude Code ${info.claude.version}`) : status.fail("Claude Code — not installed"));
  if (info.claude.installed) {
    console.log(info.claude.authenticated ? status.ok("Claude — authenticated") : status.warn("Claude — not authenticated"));
  }
}
