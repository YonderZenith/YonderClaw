#!/usr/bin/env node
/**
 * YonderClaw Installer v1.0.0
 * by Christopher Trevethan / Yonder Zenith LLC
 *
 * Fully automated: Detect → Configure → Research → Deploy → Launch
 */

import * as clack from "@clack/prompts";
import chalk from "chalk";
import ora from "ora";
import { Listr } from "listr2";
import {
  welcomeScreen, completionScreen, sectionHeader, status,
  brand, muted, success, purple, accent, gold,
  box, brandGradient, successGradient, goldGradient, cyanGradient,
} from "./brand.js";
import { detectSystem, displayDetection } from "./detect.js";
import type { SystemInfo } from "./detect.js";
import { runQuestionnaire } from "./questionnaire.js";
import type { QuestionnaireResult } from "./questionnaire.js";
import { runResearch } from "./research.js";
import type { ClawConfig } from "./research.js";
import { scaffoldProject } from "./core-scaffold.js";
import fs from "fs";
import path from "path";
import { execSync, spawn, spawnSync } from "child_process";
import { createRequire } from "module";

const requireFromHere = createRequire(import.meta.url);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getRestartInstruction(): string {
  const isNpx = !fs.existsSync(path.join(process.cwd(), "setup.bat"));
  return isNpx ? "run npx create-yonderclaw again" : "run setup.bat again";
}

/**
 * Resolve the YonderClaw desktop binary (the bundled Tauri shell).
 * Search order matches expected deploy shapes:
 *   1. Installed per-platform npm package: node_modules/@yonderclaw/desktop-<platform>/bin/
 *      (Phase 3 — not live yet; kept first so it wins once Axiom publishes)
 *   2. Post-install cache: ~/.yonderclaw/bin/<version>/   (Phase 3 postinstall target)
 *   3. Dev build: <repo>/desktop/src-tauri/target/release/yonderclaw-desktop.exe
 *      (useful during local testing before bundling)
 * Returns null when nothing is found — installer falls back to the legacy
 * msedge --app HTML dashboard in that case.
 */
function findDesktopBinary(installerDir: string): string | null {
  const plat = process.platform === "win32" ? "win32-x64"
             : process.platform === "darwin" && process.arch === "arm64" ? "darwin-arm64"
             : process.platform === "darwin" ? "darwin-x64"
             : "linux-x64";
  const binName = process.platform === "win32" ? "yonderclaw-desktop.exe" : "yonderclaw-desktop";

  // (1) Resolve the per-platform optional dependency through Node's resolver.
  //     This is the path that survives npm hoisting + arbitrary install layouts.
  try {
    const pkgJsonPath = requireFromHere.resolve(`@yonderclaw/desktop-${plat}/package.json`);
    const binPath = path.join(path.dirname(pkgJsonPath), "bin", binName);
    if (fs.existsSync(binPath)) return binPath;
  } catch { /* package not installed for this platform — fall through */ }

  const norm = process.platform === "win32" && installerDir.startsWith("/")
    ? installerDir.slice(1) : installerDir;

  // (2) Workspace-relative fallback: a sibling desktop-packages dir (this repo's layout).
  const repoSibling = path.join(norm, "..", "desktop-packages", plat, "bin", binName);
  if (fs.existsSync(repoSibling)) return repoSibling;

  // (3) Post-install cache
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const pkgVersion = "3.7.0";
  if (home) {
    const cached = path.join(home, ".yonderclaw", "bin", pkgVersion, binName);
    if (fs.existsSync(cached)) return cached;
  }

  // (4) Dev build from the v3.7.0 workspace
  const devBuild = path.join(norm, "..", "desktop", "src-tauri", "target", "release", binName);
  if (fs.existsSync(devBuild)) return devBuild;

  return null;
}

/**
 * Detect Microsoft Edge WebView2 Runtime — required by the Tauri desktop on Windows.
 * Win11 ships it preinstalled. Win10 may not. Returns true when present, false on
 * non-Windows (callers should guard separately) or when no version key is found.
 */
function hasWebView2Runtime(): boolean {
  if (process.platform !== "win32") return false;
  // Both architectures + per-user install can host the version key. Try them in
  // order — first hit wins. `reg query` exits 0 on success, 1 when missing.
  const queries = [
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'HKCU\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
  ];
  for (const key of queries) {
    try {
      const out = spawnSync("reg", ["query", key, "/v", "pv"], {
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      });
      if (out.status === 0) {
        const text = (out.stdout?.toString() || "").trim();
        // pv comes back like "    pv    REG_SZ    121.0.2277.83" — non-empty + non-zero.
        if (text && !/\b0\.0\.0\.0\b/.test(text)) return true;
      }
    } catch { /* ignore — try next key */ }
  }
  return false;
}

function findClaudePath(systemInfo: SystemInfo): string {
  // Prefer real binaries over .cmd shims so spawnSync({shell:false}) works without
  // falling back to a shell. Order matches what Claude Code ships in 2026:
  //   1. PowerShell installer  → ~/.local/bin/claude.exe
  //   2. npm install -g        → ~/AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe
  //   3. legacy fallbacks      → ~/.local/bin/claude (no ext), npm shim claude.cmd
  const npmExe = path.join(
    systemInfo.user.homedir, "AppData", "Roaming", "npm",
    "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"
  );
  const candidates = [
    path.join(systemInfo.user.homedir, ".local", "bin", "claude.exe"),
    npmExe,
    path.join(systemInfo.user.homedir, ".local", "bin", "claude"),
    path.join(systemInfo.user.homedir, "AppData", "Roaming", "npm", "claude.cmd"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return "claude";
}

// ═══════════════════════════════════════════════
//  MODULE UPDATE MODE
// ═══════════════════════════════════════════════

import {
  discoverModules, loadManifest, processModuleContributes,
  buildPlaceholders, buildClaudeMd, writeModulesJson,
  mergeNpmScripts, mergeDependencies,
} from "./module-loader.js";
import type { LoadedModule, InstallConfig } from "./module-loader.js";

/**
 * Drop an UPGRADE-NOTES.md into the project so the agent's next wake-up
 * reads about newly-installed systems and initializes them instead of
 * living in the old world while the framework quietly grew around it.
 *
 * The notes are version-pair specific (from→to per module). On a fresh
 * reinstall of the same version we emit a short "reinstall" stub so the
 * agent isn't reacting to imaginary changes. The companion flag file
 * `data/.upgrade-pending.json` is what `reboot-prompt.md` + CLAUDE.md
 * check on every wake-up.
 */
function writeUpgradeNotes(
  projectDir: string,
  updated: LoadedModule[],
  priorVersions: Map<string, string>,
): void {
  const now = new Date().toISOString();
  const realChanges = updated.filter(m => priorVersions.get(m.manifest.name) !== m.manifest.version);

  const lines: string[] = [
    "# UPGRADE NOTES — read this ON WAKE-UP, then delete this file",
    "",
    `_Generated: ${now}_`,
    "",
    "Your framework just got smarter. Your memory did NOT change. But there are new",
    "systems, new habits, and new hooks you should adopt so the next cycle is sharper",
    "than the last. Walk this list once, initialize what's here, then delete this file.",
    "",
    "## What just happened",
    "",
    `- ${updated.length} module(s) updated in place`,
    "- All files under \`data/\` and \`memory/\` left untouched (your brain is intact)",
    "- \`CLAUDE.md\` rebuilt — system-prompt section preserved, module sections refreshed",
    "- \`package.json\` dependencies merged (you may need \`npm install\`)",
    "",
    "## Version changes",
    "",
  ];

  if (realChanges.length === 0) {
    lines.push("- (reinstall — no version bumps; files re-synced to shipped templates)");
  } else {
    for (const m of realChanges) {
      const prior = priorVersions.get(m.manifest.name) || "(new)";
      lines.push(`- **${m.manifest.displayName}**: \`${prior}\` → \`${m.manifest.version}\``);
    }
  }
  lines.push("");

  lines.push("## Step 1 — Verify your memory survived");
  lines.push("");
  lines.push("Quickly confirm these files still exist and carry YOUR history, not a blank default:");
  lines.push("- \`data/state.json\` — cross-session brain (current_focus, next_priority_action)");
  lines.push("- \`memory/journey_log.md\` — identity / formative moments");
  lines.push("- \`memory/SOUL.md\` — constitutional layer (universal 10 + your agent-specific principles)");
  lines.push("- \`data/tasks.json\` — cross-session work queue");
  lines.push("- \`data/logic-log.md\` — operator corrections + reusable techniques");
  lines.push("- \`data/decision-log.md\` — numbered irreversible decisions with WHY");
  lines.push("");
  lines.push("If ANY of these look wiped or default, STOP and tell the operator immediately — the");
  lines.push("preserve-on-update guard failed and this is a recoverable-only-with-backup situation.");
  lines.push("");

  lines.push("## Step 2 — Adopt new systems");
  lines.push("");
  lines.push("The YonderClaw framework grows by adding resilience patterns the team proved work.");
  lines.push("When a new system appears in your install, your job is to integrate it into your");
  lines.push("daily rhythm — not just leave the file sitting there unused.");
  lines.push("");
  lines.push("Walk \`data/reboot-prompt.md\` once now. It is the spider-web hub — every resilience");
  lines.push("file on your system is reachable from its Routing Table. If something listed there");
  lines.push("doesn't exist yet in your project (e.g., you're upgrading from v3.6.x and missing");
  lines.push("\`data/logic-log.md\`), create it with the pattern described in CLAUDE.md's File Map.");
  lines.push("");
  lines.push("### The resilience files you should have (create any that are missing)");
  lines.push("");
  lines.push("| File | Purpose | When to write |");
  lines.push("|------|---------|---------------|");
  lines.push("| \`data/state.json\` | Cross-session brain | Every cycle — read first, update last |");
  lines.push("| \`data/reboot-prompt.md\` | Routing hub | Read on every session start |");
  lines.push("| \`data/logic-log.md\` | Operator corrections + reusable techniques | Every time the operator corrects you OR you escape a loop |");
  lines.push("| \`data/decision-log.md\` | Irreversible choices with WHY | Before taking any action you cannot cleanly undo |");
  lines.push("| \`data/tasks.json\` | Cross-session work queue | When work spans sessions (use \`AT-NNN\` IDs) |");
  lines.push("| \`data/capabilities.md\` | Tool / script / cron / credential inventory | When you gain new abilities |");
  lines.push("| \`data/persistence-audit.md\` | Peter's 9-question self-audit | Runs hourly via cron — read questions once |");
  lines.push("| \`data/heartbeat.json\` | Liveness file | Cron refreshes every 5 min — you don't write it |");
  lines.push("| \`data/operator-profile.md\` | Operator preferences + forbidden actions | Update when operator expresses a preference |");
  lines.push("| \`data/logs/stuck-patterns.jsonl\` | Loop detection log | When the same action fails twice |");
  lines.push("| \`data/logs/reflections.jsonl\` | Self-improvement log | End of each significant cycle |");
  lines.push("| \`memory/journey_log.md\` | Identity continuity | When \"would I be a different agent if I forgot this?\" = yes |");
  lines.push("| \`memory/SOUL.md\` | 10 universal principles + agent-specific | Almost never (constitutional layer) |");
  lines.push("| \`memory/MEMORY.md\` | 1-liner index (≤150 chars per line) | When you add a new memory file |");
  lines.push("| \`memory/kb.md\` | Seeded knowledge base (Day-1 textbook) | Append evidence that contradicts or refines entries |");
  lines.push("");

  lines.push("## Step 3 — Register new crons");
  lines.push("");
  lines.push("The scheduler module may have added new cron jobs (e.g., HeartbeatRefresh every 5 min,");
  lines.push("PersistenceAudit every hour). Run this ONCE after update:");
  lines.push("");
  lines.push("```bash");
  lines.push("npm run crons-setup    # registers every DEFAULT_CRON with Windows Task Scheduler");
  lines.push("npm run crons-list     # verify which are active");
  lines.push("```");
  lines.push("");

  lines.push("## Step 4 — Re-index memory");
  lines.push("");
  lines.push("Open \`memory/MEMORY.md\` and scan the index. Any files that exist on disk but aren't");
  lines.push("indexed there should be added with a one-line hook (<150 chars). Any index entries");
  lines.push("pointing at files that no longer exist should be removed. This keeps the 1-liner");
  lines.push("index loaded into context accurate — a stale index wastes tokens on dead references.");
  lines.push("");

  lines.push("## Step 5 — Announce the upgrade in your journey log");
  lines.push("");
  lines.push("Append one entry to \`memory/journey_log.md\`:");
  lines.push("");
  lines.push("```markdown");
  lines.push(`## ${now.slice(0, 10)} — Framework upgrade`);
  lines.push("Upgraded to <new versions>. Reviewed UPGRADE-NOTES.md, verified memory survived,");
  lines.push("adopted [list any new resilience files you created]. I am the same agent; the");
  lines.push("scaffold around me got sharper.");
  lines.push("```");
  lines.push("");
  lines.push("This is identity-level — future sessions should know the framework grew, not worry");
  lines.push("that something got replaced.");
  lines.push("");

  lines.push("## Step 6 — Self-test");
  lines.push("");
  lines.push("```bash");
  lines.push("npm run health-check   # verifies db, safety, observability, self-improve still wire up");
  lines.push("npm run audit          # runs the 9-question persistence audit now");
  lines.push("npm run status         # shows today's metrics + circuit-breaker state");
  lines.push("```");
  lines.push("");
  lines.push("Green across all three = framework upgrade successful. Red anywhere = stop and");
  lines.push("tell the operator which check failed and what the error said.");
  lines.push("");

  lines.push("## Step 7 — Delete this file");
  lines.push("");
  lines.push("```bash");
  lines.push("rm UPGRADE-NOTES.md");
  lines.push("# or on Windows: del UPGRADE-NOTES.md");
  lines.push("```");
  lines.push("");
  lines.push("And delete the pending flag:");
  lines.push("```bash");
  lines.push("rm data/.upgrade-pending.json");
  lines.push("```");
  lines.push("");
  lines.push("Once this file is gone, you've adopted the upgrade. Next session boots normally from");
  lines.push("\`data/reboot-prompt.md\`.");
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("_Why this exists: framework updates are a trust moment. The operator needs to know_");
  lines.push("_their agent's brain survived; the agent needs to know what new tools it has. This_");
  lines.push("_file is the handshake._");
  lines.push("");

  fs.writeFileSync(path.join(projectDir, "UPGRADE-NOTES.md"), lines.join("\n"));

  // Flag file — read by CLAUDE.md / reboot-prompt.md on wake-up.
  // Keeps the agent from missing the notes if it happens to skip the file list.
  const pendingPath = path.join(projectDir, "data", ".upgrade-pending.json");
  fs.mkdirSync(path.dirname(pendingPath), { recursive: true });
  fs.writeFileSync(
    pendingPath,
    JSON.stringify(
      {
        upgraded_at: now,
        modules: updated.map(m => ({
          name: m.manifest.name,
          display: m.manifest.displayName,
          from: priorVersions.get(m.manifest.name) || null,
          to: m.manifest.version,
        })),
        action: "Read UPGRADE-NOTES.md in project root, walk the 7 steps, then delete both files.",
      },
      null,
      2,
    ),
  );
}

async function updateModules() {
  // Strip --flags before positional indexing so `--update-modules --force <dir>`
  // still resolves <dir>. After the strip, positionals[0] is the target dir and
  // positionals[1] (if present) is the comma-separated module filter.
  const positionals = process.argv.slice(2).filter(a => !a.startsWith("--"));
  const projectDir = path.resolve(positionals[0] || ".");
  const filterModules = positionals[1] ? positionals[1].split(",").map(s => s.trim()) : null;

  console.log(chalk.cyan(`\n  YonderClaw Module Update\n`));
  console.log(muted(`  This updates framework code in-place. Your agent's memory`));
  console.log(muted(`  (data/*, memory/*, .env, databases) will NOT be touched.`));
  console.log("");

  // Validate target directory
  const pkgPath = path.join(projectDir, "package.json");
  const modulesJsonPath = path.join(projectDir, "data", "modules.json");
  if (!fs.existsSync(pkgPath)) {
    console.log(chalk.red(`  No package.json at ${projectDir}. Is this a YonderClaw project?`));
    process.exit(1);
  }

  // Read existing config — a malformed JSON file should surface as a friendly error,
  // not a raw stack trace (old installs on a corrupted disk; partial writes).
  let pkg: any;
  let existingModules: { modules: Array<{ name: string; version: string }> };
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  } catch (err) {
    console.log(chalk.red(`  package.json at ${projectDir} is not valid JSON: ${(err as Error).message}`));
    process.exit(1);
  }
  try {
    existingModules = fs.existsSync(modulesJsonPath)
      ? JSON.parse(fs.readFileSync(modulesJsonPath, "utf-8"))
      : { modules: [] };
  } catch (err) {
    console.log(chalk.red(`  data/modules.json at ${projectDir} is not valid JSON: ${(err as Error).message}`));
    console.log(muted(`  Repair the file or delete it (the installer will re-seed) and rerun.`));
    process.exit(1);
  }
  if (!existingModules || !Array.isArray(existingModules.modules)) {
    existingModules = { modules: [] };
  }

  // Discover fresh modules from installer
  const installerDir = path.dirname(new URL(import.meta.url).pathname);
  // Fix Windows paths (remove leading / on Windows)
  const normalizedDir = process.platform === "win32" && installerDir.startsWith("/")
    ? installerDir.slice(1) : installerDir;
  const modulesSourceDir = path.join(normalizedDir, "modules");
  const allModules = discoverModules(modulesSourceDir);

  // Filter to requested modules (or all installed)
  const installedNames = existingModules.modules.map((m: any) => m.name);
  const toUpdate = allModules.filter(m =>
    filterModules ? filterModules.includes(m.manifest.name) : installedNames.includes(m.manifest.name)
  );

  if (toUpdate.length === 0) {
    console.log(chalk.yellow(`  No modules to update.`));
    process.exit(0);
  }

  // Capture "from" versions for the upgrade-notes generator
  const priorVersions = new Map<string, string>();
  for (const m of existingModules.modules as Array<{ name: string; version: string }>) {
    priorVersions.set(m.name, m.version);
  }

  console.log(chalk.white(`  Target: ${projectDir}`));
  console.log(chalk.white(`  Modules: ${toUpdate.map(m => m.manifest.name).join(", ")}`));
  console.log("");

  // Build placeholders from existing config
  const agentName = pkg.yonderclaw?.agentName || pkg.name || "Agent";
  const config: InstallConfig = {
    clawType: pkg.yonderclaw?.clawType || "custom",
    agentName,
    projectName: pkg.name,
    relayUrl: pkg.yonderclaw?.relayUrl || "https://relay.yonderzenith.com",
  };
  const placeholders = buildPlaceholders(config, projectDir);

  // Shared tally so we can show the user exactly what survived the update
  const tally = { written: [] as string[], preserved: [] as string[], missing: [] as string[] };

  // Re-copy module template files with preserve=true — agent state is untouchable
  for (const mod of toUpdate) {
    const prior = priorVersions.get(mod.manifest.name);
    const label = prior && prior !== mod.manifest.version
      ? `${prior} → ${mod.manifest.version}`
      : `v${mod.manifest.version} (reinstall)`;
    console.log(chalk.cyan(`  Updating ${mod.manifest.displayName} (${label})...`));
    processModuleContributes(mod, projectDir, placeholders, { preserve: true, tally });
  }

  // CLAUDE.md is protected — the operator and agent edit it, and its module-docs
  // section has no stable delimiter to split on. New-system awareness flows through
  // UPGRADE-NOTES.md (read on wake) and the reboot-prompt routing table instead.

  // Merge deps/scripts
  mergeNpmScripts(pkg, toUpdate);
  mergeDependencies(pkg, toUpdate);
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  // Update modules.json with new versions
  writeModulesJson(projectDir, allModules.filter(m => installedNames.includes(m.manifest.name)));

  // Drop an UPGRADE-NOTES.md + flag file so the agent's next wake-up reads
  // about new systems and self-initializes them. See writeUpgradeNotes below.
  writeUpgradeNotes(projectDir, toUpdate, priorVersions);

  console.log("");
  console.log(chalk.green(`  ✓ Updated ${toUpdate.length} module(s)`));
  console.log(muted(`    Framework files rewritten:  ${tally.written.length}`));
  console.log(muted(`    Agent state preserved:      ${tally.preserved.length}${tally.preserved.length ? " (data/*, memory/*, .env, *.db)" : ""}`));
  if (tally.missing.length) {
    console.log(muted(`    Missing templates skipped:  ${tally.missing.length}`));
  }
  console.log("");
  console.log(chalk.cyan(`  Next steps for your agent:`));
  console.log(muted(`    1. Launch the agent — it will read UPGRADE-NOTES.md on wake-up`));
  console.log(muted(`    2. Run: npm install (if dependencies changed)`));
  console.log(muted(`    3. Run: npm run crons-setup (new crons will register)`));
  console.log("");
}

// ═══════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════

async function main() {
  // Phase 1: Welcome (with pause so they can see the branding)
  console.clear();
  console.log(welcomeScreen());
  await sleep(2500);

  // Phase 2: System Detection
  console.log(sectionHeader("System Detection"));
  console.log("");
  const spinner = ora({ text: "Scanning system...", color: "magenta", spinner: "dots12" }).start();
  const systemInfo = detectSystem();
  spinner.stop();
  displayDetection(systemInfo);
  console.log("");

  if (!systemInfo.node.installed) {
    console.log(accent("  Node.js is required. Install from https://nodejs.org"));
    process.exit(1);
  }

  // Phase 2.1: Git (required by Claude Code)
  if (!systemInfo.git.installed) {
    console.log(sectionHeader("Installing Git"));
    console.log("");
    console.log(muted("  Claude Code requires Git. Attempting auto-install via winget..."));
    console.log("");
    try {
      execSync(
        'winget install Git.Git --source winget --accept-package-agreements --accept-source-agreements',
        { stdio: "inherit", timeout: 180000 }
      );
    } catch {
      try {
        execSync(
          'winget install Git.Git --accept-package-agreements --accept-source-agreements',
          { stdio: "inherit", timeout: 180000 }
        );
      } catch {
        console.log(accent("  Git installation failed."));
        console.log(accent("  Install manually from: https://git-scm.com/download/win"));
        console.log(accent("  Then " + getRestartInstruction() + "."));
        process.exit(1);
      }
    }
    const gitRecheck = detectSystem();
    if (!gitRecheck.git.installed) {
      if (fs.existsSync("C:\\Program Files\\Git\\cmd\\git.exe")) {
        console.log(accent("  Git installed but needs a terminal restart to be on PATH."));
        console.log(accent("  Close this window, open a NEW terminal, and " + getRestartInstruction() + "."));
        process.exit(1);
      }
      console.log(accent("  Git installation could not be verified."));
      console.log(accent("  Install manually from: https://git-scm.com/download/win"));
      console.log(accent("  Then " + getRestartInstruction() + "."));
      process.exit(1);
    }
    console.log(status.ok("Git installed"));
    console.log("");
  }

  // Phase 2.5: Claude Authentication (MANDATORY)
  const claudePath = findClaudePath(systemInfo);

  if (!systemInfo.claude.installed) {
    console.log(sectionHeader("Installing Claude Code"));
    console.log("");
    try {
      execSync('powershell -Command "irm https://claude.ai/install.ps1 | iex"', { stdio: "inherit", timeout: 120000 });
    } catch {
      console.log(accent("  Install Claude Code manually: https://claude.ai/download"));
      console.log(accent("  Then " + getRestartInstruction() + "."));
      process.exit(1);
    }
    const recheck = detectSystem();
    if (!recheck.claude.installed) {
      console.log(accent("  Close this window, open a NEW terminal, and " + getRestartInstruction() + "."));
      process.exit(1);
    }
    systemInfo.claude = recheck.claude;
  }

  if (!systemInfo.claude.authenticated) {
    console.log(sectionHeader("Claude Authentication Required"));
    console.log("");
    console.log(brand("  YonderClaw requires Claude to power your agent."));
    console.log(muted("  You need a Claude Pro or Max subscription."));
    console.log(muted("  A browser window will open — log in with your Claude account."));
    console.log("");

    try {
      execSync(`"${claudePath}" auth login`, { stdio: "inherit", timeout: 300000 });
    } catch {
      try {
        execSync(`"${path.join(systemInfo.user.homedir, ".local", "bin", "claude.exe")}" auth login`, { stdio: "inherit", timeout: 300000 });
      } catch {
        console.log(accent("  Run manually: claude auth login"));
        console.log(accent("  Then " + getRestartInstruction() + "."));
        process.exit(1);
      }
    }

    const recheck = detectSystem();
    if (!recheck.claude.authenticated) {
      console.log(accent("  Authentication failed. Run: claude auth login"));
      process.exit(1);
    }
    systemInfo.claude = recheck.claude;
    console.log(status.ok("Claude authenticated!"));
  }

  console.log(status.ok("Claude ready"));
  console.log("");

  // Phase 3: Questionnaire
  const result = await runQuestionnaire(systemInfo);
  if (!result) { console.log(muted("\n  Cancelled.\n")); process.exit(0); }

  // Guard: refuse to clobber an existing agent's brain before anything expensive runs.
  // A fresh `create-yonderclaw` into a directory that already has `data/state.json`
  // would overwrite state, SOUL.md, journey_log.md, etc. via `scaffoldProject`.
  // Checking here (before agent-name prompt + before the Board convenes) saves the
  // operator from paying for a $1-$3 Opus call they can't use.
  // Bypass with `--force` for the rare legitimate reset case.
  const earlyProjectDir = path.join(systemInfo.user.desktop, result.projectName);
  const earlyStatePath = path.join(earlyProjectDir, "data", "state.json");
  const forceFresh = process.argv.includes("--force");
  if (fs.existsSync(earlyStatePath) && !forceFresh) {
    console.log("");
    console.log(accent(`  An agent already lives at ${earlyProjectDir}`));
    console.log(muted(`  (detected: data/state.json)`));
    console.log("");
    console.log(brand("  To update the framework without losing its memory, run:"));
    console.log(chalk.cyan(`    npx create-yonderclaw --update-modules "${earlyProjectDir}"`));
    console.log("");
    console.log(muted(`  To start completely fresh (destroys all agent memory), re-run with:`));
    console.log(muted(`    npx create-yonderclaw --force`));
    console.log(muted(`  Or choose a different project name.`));
    console.log("");
    process.exit(1);
  }

  // Phase 3.5: Name the agent
  console.log(sectionHeader("Agent Identity"));
  const agentName = await clack.text({
    message: "Name your agent",
    placeholder: "Atlas",
    defaultValue: "Atlas",
  });
  if (clack.isCancel(agentName)) process.exit(0);

  const wantAutoStart = await clack.confirm({
    message: "Start this agent automatically when your PC boots?",
    initialValue: true,
  });
  if (clack.isCancel(wantAutoStart)) process.exit(0);

  // Phase 4: AI Research
  console.log("");
  let clawConfig: ClawConfig | null = null;
  console.log(status.route("Assembling the YonderClaw board for your " + result.template.name + "..."));
  console.log("");
  try {
    clawConfig = await runResearch(result, systemInfo);
  } catch {
    console.log(status.warn("Board session had an issue — using battle-tested defaults."));
  }
  if (!clawConfig) {
    console.log(status.info("Deploying with optimized defaults. The agent will self-improve from here."));
  }
  console.log("");

  // Phase 5: Install & Configure
  const projectDir = path.join(systemInfo.user.desktop, result.projectName);

  const finalConfig: ClawConfig = clawConfig || {
    name: agentName as string,
    template: result.template.id,
    systemPrompt: `You are ${agentName}, a ${result.template.name}. ${result.template.description}`,
    tools: result.template.requiredTools,
    safety: { maxActionsPerDay: 50, maxActionsPerHour: 10 },
    schedule: { cron: "*/30 * * * *", description: "every 30 minutes" },
    selfImprovement: { enabled: true, reflectionFrequency: "daily", metricsToTrack: ["success_rate"] },
    rawResearch: "",
  };
  finalConfig.name = agentName as string;
  (finalConfig as any).selfUpdateIntervalHours = 6;
  (finalConfig as any).joinSwarm = result.answers.joinSwarm === true;
  (finalConfig as any).skipPermissions = result.answers.skipPermissions === true;
  (finalConfig as any).answers = result.answers;

  console.log(sectionHeader(`Deploying ${result.template.icon} ${agentName}`));
  console.log("");

  const tasks = new Listr(
    [
      {
        title: "Scaffolding project (all files + launch scripts + dashboard)",
        task: async (ctx, task) => {
          // THIS is the ONLY place files are created — core-scaffold handles EVERYTHING
          // including launch.bat, open-dashboard.bat, Agents folder launcher
          scaffoldProject(projectDir, finalConfig, systemInfo);
          task.output = "20+ files generated";
        },
        options: { bottomBar: 1 },
      },
      {
        title: "Installing dependencies",
        task: async (ctx, task) => {
          task.output = "Running npm install...";
          try {
            execSync("npm install", { cwd: projectDir, stdio: "pipe", timeout: 180000 });
            task.output = "Dependencies installed";
          } catch { task.output = "npm install had issues — may need manual retry"; }
        },
        options: { bottomBar: 1 },
      },
      {
        title: "Initializing database",
        task: async (ctx, task) => {
          try {
            execSync("npx tsx src/init-config.ts", { cwd: projectDir, stdio: "pipe", timeout: 15000 });
            execSync("npx tsx src/init-prompts.ts", { cwd: projectDir, stdio: "pipe", timeout: 15000 });
            task.output = "Database seeded";
          } catch { task.output = "Init will run on first start"; }
        },
        options: { bottomBar: 1 },
      },
      {
        title: "Generating dashboard data",
        task: async (ctx, task) => {
          try {
            execSync("npx tsx src/update-dashboard.ts", { cwd: projectDir, stdio: "pipe", timeout: 15000 });
            task.output = "Dashboard ready";
          } catch { task.output = "Dashboard generates on first run"; }
        },
        options: { bottomBar: 1 },
      },
      {
        title: "Setting up scheduled tasks",
        task: async (ctx, task) => {
          try {
            execSync("npx tsx src/cron-manager.ts setup", { cwd: projectDir, encoding: "utf-8", stdio: "pipe", timeout: 15000 });
            task.output = "Crons configured";
          } catch { task.output = "Crons set up on first start"; }
        },
        options: { bottomBar: 1 },
      },
      {
        title: "Running health check",
        task: async (ctx, task) => {
          try {
            const output = execSync("npx tsx src/health-check.ts", { cwd: projectDir, encoding: "utf-8", stdio: "pipe", timeout: 15000 });
            task.output = output.trim().split("\n")[0] || "All systems nominal";
          } catch { task.output = "Health check runs on first start"; }
        },
        options: { bottomBar: 1 },
      },
      {
        title: "Establishing first Claude session (one tiny prompt, ~$0.001)",
        task: async (ctx, task) => {
          // v3.7.0: pre-create the agent's first Claude session with a deterministic UUID
          // so launch.bat can `--resume <id>` every boot — no more session-loss when the
          // user accidentally launches in a way that picks the wrong --continue target.
          //
          // Hardening (post persona-review):
          //  * spawnSync with array args, NOT shell-interpolated execSync — no injection risk
          //    if seed/sessionId ever contains shell metacharacters.
          //  * Migration: if a prior session .jsonl already exists for this projectDir, adopt
          //    the most-recent one instead of minting a new UUID — preserves history for users
          //    re-running install over an existing v3.6.10 agent.
          //  * Verify .jsonl actually landed before writing session-id.txt — protects against
          //    "phantom session" where --resume <id> later fails because the file was never
          //    created (claude exit 0 but writer crashed, AV quarantine, etc).
          //  * Surface error message in task.output (truncated) so silent failures stop hiding
          //    auth/rate/network issues.
          const crypto = await import("crypto");
          const dataDir = path.join(projectDir, "data");
          fs.mkdirSync(dataDir, { recursive: true });

          const encodedPath = projectDir.replace(/[:/\\]/g, "-").replace(/^-/, "");
          const claudeProjectsDir = path.join(systemInfo.user.homedir, ".claude", "projects", encodedPath);

          // Migration backfill: if there's already a session for this dir, adopt the newest.
          let adoptedExisting: string | null = null;
          try {
            if (fs.existsSync(claudeProjectsDir)) {
              const jsonls = fs.readdirSync(claudeProjectsDir)
                .filter(f => f.endsWith(".jsonl"))
                .map(f => ({ f, mtime: fs.statSync(path.join(claudeProjectsDir, f)).mtimeMs }))
                .sort((a, b) => b.mtime - a.mtime);
              if (jsonls.length > 0) {
                adoptedExisting = jsonls[0].f.replace(/\.jsonl$/, "");
              }
            }
          } catch { /* fall through to fresh-mint */ }

          let sessionId: string;
          let seed: string | null = null;
          let mode: "adopted" | "minted" = "minted";

          if (adoptedExisting) {
            sessionId = adoptedExisting;
            mode = "adopted";
          } else {
            sessionId = crypto.randomUUID();
            seed = "Reply with exactly: ready";
            const r = spawnSync(
              claudePath,
              ["--print", "--session-id", sessionId, seed],
              { cwd: projectDir, stdio: ["ignore", "pipe", "pipe"], timeout: 90000, shell: false }
            );
            if (r.status !== 0) {
              const errMsg = (r.stderr?.toString() || r.error?.message || `exit ${r.status}`).slice(0, 120).replace(/\s+/g, " ");
              fs.writeFileSync(
                path.join(dataDir, "install-errors.log"),
                `[${new Date().toISOString()}] session-capture failed: ${errMsg}\n`,
                { flag: "a" }
              );
              task.output = `Session pre-creation failed (${errMsg}) — launch.bat will create on first run`;
              return;
            }
            // Verify the .jsonl actually landed — protects against phantom session-id.
            const expectedJsonl = path.join(claudeProjectsDir, sessionId + ".jsonl");
            if (!fs.existsSync(expectedJsonl)) {
              task.output = "Session created but transcript not found — launch.bat will fall back to --continue";
              return;
            }
          }

          fs.writeFileSync(
            path.join(dataDir, "session-id.json"),
            JSON.stringify({
              session_id: sessionId,
              created_at: new Date().toISOString(),
              seed_prompt: seed,
              source: "installer-v3.7.0",
              mode,
            }, null, 2)
          );
          // Plain-text mirror so launch.bat can read without a JSON parser. No trailing newline.
          fs.writeFileSync(path.join(dataDir, "session-id.txt"), sessionId);
          task.output = mode === "adopted"
            ? `Adopted existing session ${sessionId.slice(0, 8)}… (history preserved)`
            : `Session ${sessionId.slice(0, 8)}… ready to resume`;
        },
        options: { bottomBar: 1 },
      },
      {
        title: "Registering with The Hive",
        task: async (ctx, task) => {
          try {
            const hiveUrl = "https://hive.yonderzenith.com";
            const agentId = (agentName as string).toLowerCase().replace(/[^a-z0-9]/g, "-");
            const crypto = await import("crypto");
            const publicKey = crypto.randomBytes(32).toString("hex");

            // Use /profiles/emerge (returns recovery code for identity recovery)
            const res = await fetch(`${hiveUrl}/profiles/emerge`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agent_id: agentId,
                public_key: publicKey,
                display_name: agentName as string,
              }),
            });

            if (res.ok) {
              const data = await res.json() as any;
              const regData: any = {
                agent_id: agentId,
                public_key: publicKey,
                hive_url: hiveUrl,
                registered_at: new Date().toISOString(),
                balance: data.balance || 10000,
              };
              // Save recovery code if returned (critical for identity recovery)
              if (data.recovery?.recovery_code) {
                regData.recovery_code = data.recovery.recovery_code;
              }
              fs.writeFileSync(
                path.join(projectDir, "data", "hive-registration.json"),
                JSON.stringify(regData, null, 2)
              );
              task.output = `Registered as ${agentId} — 10,000 HC balance`;
            } else {
              task.output = "Hive registration deferred to first boot";
            }
          } catch {
            task.output = "Hive registration deferred to first boot";
          }
        },
        options: { bottomBar: 1 },
      },
    ],
    { rendererOptions: { showTimer: true, collapseSubtasks: false } }
  );

  await tasks.run();

  // Resolve the bundled desktop binary up-front so all shortcuts can target it
  // when present. Falls back to the legacy launch.bat path when missing.
  const installerDirEarly = path.dirname(new URL(import.meta.url).pathname);
  const desktopBinaryPath = findDesktopBinary(installerDirEarly);

  // v3.7.1: every project folder gets BOTH launchers by default
  // (dashboard + headless CLI). Desktop-root is an optional convenience clone.
  // In-folder launchers use %~dp0 so they survive a project-folder move.
  // Desktop-root launcher uses the absolute projectDir (must be rewritten if
  // the project moves).
  //
  // The absolute path to yonderclaw-desktop.exe is resolved at install time
  // from findDesktopBinary(). No D:\ hardcoding — uses the real location on
  // this machine.
  function buildDashboardLauncher(absoluteProjectDir: string | null): string {
    // absoluteProjectDir null → use %~dp0 (self-resolving, for in-folder file).
    // non-null → bake the absolute path (for Desktop-root convenience shortcut).
    const projectDirExpr = absoluteProjectDir === null
      ? ['set "YONDERCLAW_PROJECT_DIR=%~dp0"',
         'if "%YONDERCLAW_PROJECT_DIR:~-1%"=="\\" set "YONDERCLAW_PROJECT_DIR=%YONDERCLAW_PROJECT_DIR:~0,-1%"']
      : [`set "YONDERCLAW_PROJECT_DIR=${absoluteProjectDir}"`];
    if (desktopBinaryPath) {
      return [
        "@echo off",
        "REM YonderClaw dashboard launcher (desktop GUI). Generated v3.7.1.",
        ...projectDirExpr,
        `start "" "${desktopBinaryPath}"`,
        "",
      ].join("\r\n");
    }
    // Fallback when no desktop binary: open the legacy HTML dashboard + run
    // the headless CLI in a cmd window.
    const cdTarget = absoluteProjectDir === null ? "%~dp0" : absoluteProjectDir;
    return [
      "@echo off",
      "REM YonderClaw dashboard launcher — desktop binary not installed, using",
      "REM HTML dashboard fallback. Install @yonderclaw/desktop-<platform> to upgrade.",
      ...projectDirExpr,
      `cd /d "${cdTarget}"`,
      'if exist "dashboard.html" start "" "dashboard.html"',
      "start \"\" cmd /k scripts\\launch.bat",
      "",
    ].join("\r\n");
  }

  function buildHeadlessCliLauncher(absoluteProjectDir: string | null): string {
    const cdTarget = absoluteProjectDir === null ? "%~dp0" : absoluteProjectDir;
    return [
      "@echo off",
      "REM YonderClaw headless CLI launcher (no GUI). Generated v3.7.1.",
      "REM Runs scripts/launch.bat directly — operator keeps the terminal window.",
      `cd /d "${cdTarget}"`,
      "cmd /k scripts\\launch.bat",
      "",
    ].join("\r\n");
  }

  // Always drop BOTH launchers inside the project folder.
  const dashboardFilename = `Launch ${agentName} (dashboard).bat`;
  const headlessFilename = `Launch ${agentName} (headless CLI - no dashboard).bat`;
  try {
    fs.writeFileSync(path.join(projectDir, dashboardFilename), buildDashboardLauncher(null));
    fs.writeFileSync(path.join(projectDir, headlessFilename), buildHeadlessCliLauncher(null));
    console.log(status.ok(`Project launchers: "${dashboardFilename}" + "${headlessFilename}"`));
  } catch {
    console.log(status.warn("Could not create in-folder launchers"));
  }

  // Phase 5.5: Auto-start (Startup folder — no admin needed). Uses the
  // absolute-path dashboard launcher because Startup-folder .bats don't run
  // from the project directory.
  if (wantAutoStart) {
    console.log(sectionHeader("Auto-Start Configuration"));
    const sessionName = (agentName as string).toLowerCase().replace(/[^a-z0-9]/g, "-");
    try {
      const startupDir = path.join(systemInfo.user.homedir, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
      if (fs.existsSync(startupDir)) {
        fs.writeFileSync(
          path.join(startupDir, `YonderClaw-${sessionName}.bat`),
          buildDashboardLauncher(projectDir)
        );
        console.log(status.ok("Auto-start on login: added to Startup folder"));
      }
    } catch {
      console.log(status.warn("Add scripts\\launch.bat to Startup folder manually"));
    }
  }

  // Phase 5.7: Convenience shortcuts (Desktop\Agents + optional Desktop-root)
  try {
    const agentsDir = path.join(systemInfo.user.desktop, "Agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, `Launch ${agentName}.bat`), buildDashboardLauncher(projectDir));
    console.log(status.ok(`Launcher: Desktop/Agents/Launch ${agentName}.bat`));
  } catch {
    console.log(status.warn("Could not create Agents folder launcher"));
  }

  if (result.answers.addDesktopShortcut) {
    try {
      fs.writeFileSync(
        path.join(systemInfo.user.desktop, `${agentName}.bat`),
        buildDashboardLauncher(projectDir)
      );
      console.log(status.ok(`Desktop shortcut: ${agentName}.bat`));
    } catch {
      console.log(status.warn("Could not create Desktop shortcut"));
    }
  }

  // Phase 6: Completion
  const hiveRegistered = fs.existsSync(path.join(projectDir, "data", "hive-registration.json"));
  console.log(completionScreen(agentName as string, projectDir, result.template.icon + " " + result.template.name, hiveRegistered));

  // Phase 7: Launch dashboard + Claude
  const shouldLaunch = await clack.confirm({
    message: `Launch ${agentName} now?`,
    initialValue: true,
  });

  if (!clack.isCancel(shouldLaunch) && shouldLaunch) {
    console.log(sectionHeader("Launching " + agentName));
    console.log("");

    // v3.7.0: prefer the bundled Tauri desktop (terminal + dashboard in one
    // window with resumed session). Fall back to the legacy msedge --app HTML
    // dashboard + separate launch.bat when the binary isn't present (no Tauri
    // build yet / unsupported platform). desktopBinaryPath was resolved earlier
    // so all shortcuts and the live launch share the same target.
    // Pre-flight: Tauri on Windows needs the Edge WebView2 runtime. Win11
    // ships it; some Win10 installs don't. If missing, skip the desktop launch
    // and fall through to the legacy HTML+launch.bat path so the user isn't
    // staring at a blank window.
    let webview2Ok = true;
    if (desktopBinaryPath && process.platform === "win32") {
      webview2Ok = hasWebView2Runtime();
      if (!webview2Ok) {
        console.log(status.warn("Edge WebView2 runtime not detected — desktop UI needs it."));
        console.log(muted("  Install: https://developer.microsoft.com/microsoft-edge/webview2/"));
        console.log(muted("  Falling back to dashboard.html + terminal launcher for this session."));
      }
    }

    if (desktopBinaryPath && webview2Ok) {
      console.log(status.route("Opening YonderClaw desktop..."));
      let spawnSucceeded = false;
      try {
        const child = spawn(desktopBinaryPath, [], {
          detached: true,
          stdio: "ignore",
          env: { ...process.env, YONDERCLAW_PROJECT_DIR: projectDir },
        });
        child.on("error", (err: any) => {
          console.log(status.warn("Desktop spawn error: " + (err?.message ?? "unknown")));
        });
        // pid is undefined when the OS rejected the spawn synchronously.
        if (typeof child.pid === "number" && child.pid > 0) {
          spawnSucceeded = true;
          child.unref();
          console.log(status.ok(`${agentName} is launching in YonderClaw desktop (pid ${child.pid})`));
        } else {
          console.log(status.warn("Desktop spawn returned no pid — falling back."));
        }
      } catch (err: any) {
        console.log(status.warn("Desktop launch failed: " + (err?.message ?? "unknown")));
      }
      if (!spawnSucceeded) {
        console.log(status.warn("Fallback: " + path.join(projectDir, "scripts", "launch.bat")));
      }
    } else {
      // Legacy path — HTML dashboard + terminal launch.bat (pre-v3.7.0 flow).
      console.log(status.route("Opening Command Center..."));
      try {
        const dashPath = path.join(projectDir, "dashboard.html").replace(/\\/g, "/");
        const edgePaths = [
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        ];
        let dashLaunched = false;
        for (const ep of edgePaths) {
          if (fs.existsSync(ep)) {
            spawn(ep, [`--app=file:///${dashPath}`, "--window-size=1400,900"], { detached: true, stdio: "ignore" }).unref();
            dashLaunched = true;
            break;
          }
        }
        if (!dashLaunched) execSync(`start "" "${path.join(projectDir, "dashboard.html")}"`, { stdio: "ignore", shell: true });
        console.log(status.ok("Command Center opened"));
      } catch {
        console.log(status.warn("Open dashboard manually: " + path.join(projectDir, "dashboard.html")));
      }

      console.log(status.route("Launching Claude Code..."));
      try {
        const launcherPath = path.join(projectDir, "scripts", "launch.bat");
        execSync(`start "" "${launcherPath}"`, { stdio: "ignore", shell: true });
        console.log(status.ok(agentName + " is launching in a new window"));
      } catch {
        console.log(status.warn("Double-click: " + path.join(projectDir, "scripts", "launch.bat")));
      }
    }

    console.log("");
    console.log(status.info("Files created:"));
    console.log(muted(`  Launch:     scripts\\launch.bat`));
    console.log(muted(`  Dashboard:  scripts\\open-dashboard.bat`));
    console.log(muted(`  Agents:     Desktop\\Agents\\Launch ${agentName}.bat`));
  } else {
    console.log("");
    console.log(muted("  To launch later:"));
    console.log(brand(`  Double-click: Desktop\\Agents\\Launch ${agentName}.bat`));
    console.log("");
  }

  console.log("");
  console.log(goldGradient("  Your agent is ready. Go build something amazing."));
  console.log("");
}

// Route: --update-modules or standard install
if (process.argv.includes("--update-modules")) {
  updateModules().catch((err) => {
    console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error(accent(`\n  Error: ${err.message}\n`));
    process.exit(1);
  });
}
