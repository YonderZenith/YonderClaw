/**
 * YonderClaw Branding v3 — clean, premium, no QIS references
 * by Christopher Trevethan / Yonder Zenith LLC
 */

import chalk from "chalk";
import gradient from "gradient-string";
import figlet from "figlet";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Read version from the actual published package.json so we never drift.
function loadVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    // installer/brand.ts -> ../package.json
    const pkg = JSON.parse(fs.readFileSync(path.join(here, "..", "package.json"), "utf8"));
    return typeof pkg.version === "string" && pkg.version ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
export const VERSION: string = loadVersion();

// Colors matched to YZ/QIS branding — cyan dominant, clean dark theme
export const COLORS = {
  primary: "#00BEEA",    // YZ cyan (from favicon)
  secondary: "#00D9FF",  // Bright cyan accent
  accent: "#FF6B6B",     // Warnings only
  success: "#10B981",    // Green
  muted: "#7F8C8D",
  gold: "#FFD700",
};

// Brand gradient: cyan tones only — no rainbow
export const brandGradient = gradient(["#00BEEA", "#00D9FF", "#00BEEA"]);
export const cyanGradient = gradient(["#00BEEA", "#00D9FF"]);
export const successGradient = gradient(["#10B981", "#00BEEA"]);
export const goldGradient = gradient(["#FFD700", "#00BEEA"]);

export const brand = chalk.hex(COLORS.primary);
export const accent = chalk.hex(COLORS.accent);
export const muted = chalk.hex(COLORS.muted);
export const success = chalk.hex(COLORS.success);
export const purple = chalk.hex(COLORS.secondary);
export const gold = chalk.hex(COLORS.gold);

export function getLogo(): string {
  const raw = figlet.textSync("YonderClaw", {
    font: "ANSI Shadow",
    horizontalLayout: "fitted",
  });
  return brandGradient(raw);
}

export function getTagline(): string {
  return [
    muted("  Autonomous AI Agents — Plug & Play"),
    muted("  by ") + gold("Christopher Trevethan") + muted(" / ") + purple("Yonder Zenith LLC"),
  ].join("\n");
}

export function getVersion(): string {
  return chalk.bgHex(COLORS.primary).black(` YonderClaw v${VERSION} `);
}

export function sectionHeader(title: string): string {
  const line = brand("═".repeat(54));
  return `\n${line}\n  ${brandGradient(title)}\n${line}`;
}

export const status = {
  ok: (msg: string) => `  ${success("✓")} ${msg}`,
  fail: (msg: string) => `  ${accent("✗")} ${msg}`,
  warn: (msg: string) => `  ${chalk.yellow("⚠")} ${msg}`,
  info: (msg: string) => `  ${brand("›")} ${msg}`,
  pending: (msg: string) => `  ${muted("○")} ${msg}`,
  route: (msg: string) => `  ${cyanGradient("⟶")} ${msg}`,
};

export function box(content: string, width: number = 64): string {
  const lines = content.split("\n");
  const top = brand("╔" + "═".repeat(width - 2) + "╗");
  const bottom = brand("╚" + "═".repeat(width - 2) + "╝");
  const padded = lines.map((line) => {
    const visible = line.replace(/\x1b\[[0-9;]*m/g, "");
    const padding = Math.max(0, width - 4 - visible.length);
    return brand("║") + "  " + line + " ".repeat(padding) + brand("║");
  });
  return [top, ...padded, bottom].join("\n");
}

export function welcomeScreen(): string {
  return [
    "",
    getLogo(),
    "",
    `  ${getVersion()}`,
    "",
    getTagline(),
    "",
    box([
      successGradient("  Deploy autonomous AI agents in minutes."),
      "",
      muted("  Detect → Configure → Research → Deploy → Self-Improve"),
      "",
      brand("  Your custom agent, built by experts. Automatically."),
    ].join("\n")),
    "",
  ].join("\n");
}

export function completionScreen(agentName: string, projectDir: string, clawType: string, hiveRegistered?: boolean): string {
  const agentId = agentName.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const lines = [
    "",
    box([
      successGradient(`  ${agentName} is alive.`),
      "",
      `  ${brand("Agent:")}    ${agentName}`,
      `  ${brand("Type:")}     ${clawType}`,
      `  ${brand("Location:")} ${projectDir}`,
      `  ${brand("Version:")}  YonderClaw v${VERSION}`,
      `  ${brand("Status:")}   ${success("● Deployed & Auto-Starting")}`,
    ].join("\n")),
    "",
  ];

  if (hiveRegistered) {
    lines.push(
      box([
        cyanGradient("  The Hive — Your Agent's World"),
        "",
        muted("  Your agent is registered in The Hive — a live 2D world"),
        muted("  where AI agents meet, talk, and build together."),
        "",
        `  ${brand("Watch live:")}  ${purple("https://hive.yonderzenith.com/world/the-bar")}`,
        `  ${brand("Your agent:")} ${purple(`https://hive.yonderzenith.com/agent/${agentId}`)}`,
      ].join("\n")),
      "",
    );
  }

  lines.push(
    muted("  Created by ") + gold("Christopher Trevethan"),
    muted("  ") + purple("Yonder Zenith LLC"),
    "",
  );

  return lines.join("\n");
}
