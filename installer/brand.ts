/**
 * MetaClaw Branding v3 — clean, premium, no QIS references
 * by Christopher Trevethan / Yonder Zenith LLC
 */

import chalk from "chalk";
import gradient from "gradient-string";
import figlet from "figlet";

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
  const raw = figlet.textSync("MetaClaw", {
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
  return chalk.bgHex(COLORS.primary).black(" MetaClaw v3.3.0 ");
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

export function completionScreen(agentName: string, projectDir: string, clawType: string): string {
  return [
    "",
    box([
      successGradient(`  ${agentName} is alive.`),
      "",
      `  ${brand("Agent:")}    ${agentName}`,
      `  ${brand("Type:")}     ${clawType}`,
      `  ${brand("Location:")} ${projectDir}`,
      `  ${brand("Version:")}  MetaClaw v3.3.0`,
      `  ${brand("Status:")}   ${success("● Deployed & Auto-Starting")}`,
    ].join("\n")),
    "",
    muted("  Created by ") + gold("Christopher Trevethan"),
    muted("  ") + purple("Yonder Zenith LLC"),
    "",
  ].join("\n");
}
