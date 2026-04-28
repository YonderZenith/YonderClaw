/**
 * YonderClaw Core Scaffold
 *
 * Every Claw gets these built-in best practices automatically.
 * Uses template files from installer/templates/ to avoid nested backtick issues.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { ClawConfig } from "./research.js";
import type { SystemInfo } from "./detect.js";
import { generateDashboard } from "./dashboard-generator.js";
import { writeDashboardConfig } from "./dashboard-config-writer.js";
import { generateStarterTasks } from "./task-generator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "templates");
const SWARM_TEMPLATES_DIR = path.join(__dirname, "modules", "swarm", "swarm");
const QIS_RELAY_URL = "https://relay.yonderzenith.com";

function readTemplate(name: string): string {
  return fs.readFileSync(path.join(TEMPLATES_DIR, name), "utf-8");
}

/**
 * Generate the full project scaffolding for any Claw type.
 */
export function scaffoldProject(
  projectDir: string,
  config: ClawConfig,
  systemInfo: SystemInfo
): void {
  // Create directory structure
  const dirs = ["src", "src/tools", "data", "data/logs", "scripts", "memory", "docs"];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(projectDir, dir), { recursive: true });
  }

  // Write all core files
  writePackageJson(projectDir, config);
  writeClaudeMd(projectDir, config);
  writeSoulMd(projectDir, config);
  writeKnowledgeBase(projectDir, config);
  writeHeartbeatMd(projectDir, config);
  writeGitignore(projectDir);
  writeEnvExample(projectDir, config);
  writeResiliencePack(projectDir, config);

  // Copy template files (universal modules)
  fs.writeFileSync(path.join(projectDir, "src", "db.ts"), readTemplate("db.ts.txt"));
  fs.writeFileSync(path.join(projectDir, "src", "observability.ts"), readTemplate("observability.ts.txt"));
  fs.writeFileSync(path.join(projectDir, "src", "self-improve.ts"), readTemplate("self-improve.ts.txt"));

  // Dashboard — CUSTOM generated based on claw type
  const sessionName = config.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const dashboardHtml = generateDashboard(
    config.name,
    config.template,
    (config as any).answers || {},
    config.rawResearch,
    config.dashboardPanels,
  );
  fs.writeFileSync(path.join(projectDir, "dashboard.html"), dashboardHtml);

  // v3.7.2: also write data/dashboard-config.json so the Tauri UI's
  // LayoutFrame can render Board-synthesized panels + per-claw theme.
  writeDashboardConfig(projectDir, config);

  // v3.7.2: ship the agent-editable CLI helper + schema doc so agents can
  // customize their dashboard without needing to read the source.
  fs.mkdirSync(path.join(projectDir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "docs"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "scripts", "dashboard-helper.cjs"), readTemplate("dashboard-helper.cjs.txt"));
  fs.writeFileSync(path.join(projectDir, "docs", "dashboard-panels.md"), readTemplate("dashboard-panels.md.txt"));

  // Copy favicon for dashboard branding
  const faviconSrc = path.join(TEMPLATES_DIR, "..", "assets", "favicon.png");
  if (fs.existsSync(faviconSrc)) {
    fs.copyFileSync(faviconSrc, path.join(projectDir, "favicon.png"));
  }

  const dashboardTs = readTemplate("update-dashboard.ts.txt")
    .replace(/__AGENT_NAME__/g, config.name)
    .replace(/__CLAW_TYPE__/g, config.template);
  fs.writeFileSync(path.join(projectDir, "src", "update-dashboard.ts"), dashboardTs);

  // Safety — needs config substitution
  const safetyContent = readTemplate("safety.ts.txt").replace(
    "__SAFETY_CONFIG__",
    JSON.stringify({
      maxActionsPerDay: (config.safety as any)?.maxActionsPerDay || 50,
      maxActionsPerHour: (config.safety as any)?.maxActionsPerHour || 10,
      circuitBreakerThreshold: (config.safety as any)?.circuitBreakerThreshold || 0.05,
    }, null, 2)
  );
  fs.writeFileSync(path.join(projectDir, "src", "safety.ts"), safetyContent);

  // Self-update module (universal)
  fs.writeFileSync(path.join(projectDir, "src", "self-update.ts"), readTemplate("self-update.ts.txt"));

  // Health check module
  fs.writeFileSync(path.join(projectDir, "src", "health-check.ts"), readTemplate("health-check.ts.txt"));

  // Heartbeat refresh — 5-min cron liveness touch
  fs.writeFileSync(
    path.join(projectDir, "src", "heartbeat-refresh.ts"),
    readTemplate("heartbeat-refresh.ts.txt").replace(/__AGENT_NAME__/g, config.name),
  );

  // Persistence audit — hourly 9-question self-check (Peter's pattern)
  fs.writeFileSync(
    path.join(projectDir, "src", "persistence-audit.ts"),
    readTemplate("persistence-audit.ts.txt").replace(/__AGENT_NAME__/g, config.name),
  );

  // Cron manager — with variable substitution
  const selfUpdateMinutes = ((config as any).selfUpdateIntervalHours || 6) * 60;
  const cronManager = readTemplate("cron-manager.ts.txt")
    .replace(/__AGENT_NAME__/g, config.name)
    .replace(/__SESSION_NAME__/g, sessionName)
    .replace(/__SELF_UPDATE_INTERVAL__/g, String(selfUpdateMinutes));
  fs.writeFileSync(path.join(projectDir, "src", "cron-manager.ts"), cronManager);

  // system-context.json — learning accumulation (Outreach pattern)
  const sysCtx = readTemplate("system-context.json.txt")
    .replace(/__TIMESTAMP__/g, new Date().toISOString());
  fs.writeFileSync(path.join(projectDir, "data", "system-context.json"), sysCtx);

  // build-dashboard.cjs — inline data baking for offline dashboards (AXIOM pattern)
  fs.mkdirSync(path.join(projectDir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "scripts", "build-dashboard.cjs"), readTemplate("build-dashboard.cjs.txt"));

  // continuity-cloud-sync.cjs — Rule 5a (2026-04-22): PersistenceAudit cron chains
  // this script as the last step so any changed file reaches R2 within an hour.
  // Operator must install rclone + run `rclone config` once + write
  // data/continuity-cloud-config.json; the script no-ops cleanly until then.
  fs.writeFileSync(path.join(projectDir, "scripts", "continuity-cloud-sync.cjs"), readTemplate("continuity-cloud-sync.cjs.txt"));

  // Agent cycle .bat — specific numbered instructions for cron agent (AXIOM pattern)
  const cycleBat = readTemplate("agent-cycle.bat.txt")
    .replace(/__AGENT_NAME__/g, config.name)
    .replace(/__PROJECT_DIR__/g, projectDir);
  fs.writeFileSync(path.join(projectDir, "scripts", "agent-cycle.bat"), cycleBat);

  // AI Inbox Agent — 8-category classifier (Outreach pattern)
  const inboxAgent = readTemplate("inbox-agent.ts.txt").replace(/__AGENT_NAME__/g, config.name);
  fs.writeFileSync(path.join(projectDir, "src", "inbox-agent.ts"), inboxAgent);

  // Morning report email (AXIOM pattern — email is the lifeline)
  const morningReport = readTemplate("morning-report.ts.txt").replace(/__AGENT_NAME__/g, config.name);
  fs.writeFileSync(path.join(projectDir, "src", "morning-report.ts"), morningReport);

  // VIP emails list (empty — operator fills in)
  fs.writeFileSync(path.join(projectDir, "data", "vip-emails.json"), "[]");

  // Main agent entry point (template-specific)
  writeAgentFromTemplate(projectDir, config);

  // Save initial prompt version to DB-init script
  writePromptInit(projectDir, config);

  // Launch.bat — correct session directory handling.
  // v3.7.1: the template hardcodes --dangerously-skip-permissions (YonderClaw
  // agents are autonomous; the autonomy tier in state.json is the real gate).
  // Operators can opt out by setting YONDERCLAW_CLAUDE_PROMPTS=1 in env —
  // handled inside the .bat, no scaffold-time branching needed.
  const encodedPath = projectDir.replace(/[:/\\]/g, "-").replace(/^-/, "");
  const launchBat = readTemplate("launch.bat.txt")
    .replace(/__AGENT_NAME__/g, config.name)
    .replace(/__PROJECT_DIR__/g, projectDir)
    .replace(/__ENCODED_PATH__/g, encodedPath)
    .replace(/__SESSION_NAME__/g, sessionName);
  fs.writeFileSync(path.join(projectDir, "scripts", "launch.bat"), launchBat);

  // Launch config (read by the desktop binary). v3.7.1: always true — kept as
  // a file for the Rust read_skip_permissions fallback + operator introspection.
  fs.writeFileSync(
    path.join(projectDir, "data", "launch-config.json"),
    JSON.stringify({ skipPermissions: true }, null, 2),
  );

  // v3.7.1: legacy single in-folder launcher removed. The main installer now
  // emits both `Launch <Name> (dashboard).bat` + `Launch <Name> (headless CLI
  // - no dashboard).bat` into the project folder via buildDashboardLauncher /
  // buildHeadlessCliLauncher in index.ts (after the desktop binary is resolved).

  // Dashboard opener (app mode)
  const dashUrl = path.join(projectDir, "dashboard.html").replace(/\\/g, "/");
  const dashOpener = [
    "@echo off",
    `cd /d "${projectDir}"`,
    `call npx tsx src/update-dashboard.ts 2>nul`,
    `if exist "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" (`,
    `  start "" "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --app="file:///${dashUrl}" --window-size=1400,900`,
    `) else if exist "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe" (`,
    `  start "" "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe" --app="file:///${dashUrl}" --window-size=1400,900`,
    `) else (`,
    `  start "" "${path.join(projectDir, "dashboard.html")}"`,
    `)`,
  ].join("\r\n");
  fs.writeFileSync(path.join(projectDir, "scripts", "open-dashboard.bat"), dashOpener);

  // ── QIS Swarm Module (always installed) ─────────────────────────
  copySwarmFiles(projectDir, config);

  // QIS auto-connect script — runs on first boot OR when agent enables swarm later.
  //
  // CRITICAL PROPERTIES (v3.7.1 rewrite — root-cause for the "launcher hangs forever"
  // bug Brian reported on 2026-04-22): this script MUST terminate cleanly on every
  // path, including when the relay rejects a deposit or the DHT can't reach peers.
  //   (a) deposit failures logged but do not throw — launcher moves on.
  //   (b) data/qis-deposit-log.json is ALWAYS written in finally — so the launcher's
  //       gate (`if not exist data\qis-deposit-log.json`) doesn't re-hang on retry.
  //   (c) qis.shutdown() is called in finally to close the DHT socket + sync scheduler.
  //   (d) explicit process.exit(0) at the end, in case a lingering timer/handle
  //       would otherwise keep the Node event loop alive.
  //   (e) a 25-second watchdog force-exits if init() or deposit() hang on I/O.
  const autoconnectContent = [
    '/**',
    ' * QIS Auto-Connect — initializes identity and connects to relay.',
    ' * Runs automatically on first boot (if opted in) or manually via:',
    ' *   npx tsx scripts/qis-autoconnect.ts          — just init identity',
    ' *   npx tsx scripts/qis-autoconnect.ts --enable  — enable swarm (tier 0→2) + connect',
    ' *',
    ' * Must terminate cleanly on ALL paths (the launcher blocks on this script).',
    ' */',
    'import fs from "fs";',
    'import path from "path";',
    'import { qis } from "../swarm/qis-client.js";',
    'import { initConfig, updateConfig } from "../swarm/qis-config.js";',
    '',
    'const DEPOSIT_LOG_PATH = path.join(process.cwd(), "data", "qis-deposit-log.json");',
    'const WATCHDOG_MS = 25_000;',
    '',
    'function writeGate(payload: Record<string, unknown>): void {',
    '  try {',
    '    fs.mkdirSync(path.dirname(DEPOSIT_LOG_PATH), { recursive: true });',
    '    fs.writeFileSync(DEPOSIT_LOG_PATH, JSON.stringify(payload, null, 2));',
    '  } catch (e: any) {',
    '    console.error("[QIS] Could not write deposit log:", e?.message ?? e);',
    '  }',
    '}',
    '',
    'async function autoconnect() {',
    '  let agentId = "(unknown)";',
    '  let result: "ok" | "deposit_skipped" | "deposit_failed" | "init_failed" | "dormant" = "init_failed";',
    '  let lastError: string | null = null;',
    '',
    '  try {',
    '    // If --enable flag, upgrade tier from 0 to 2 before full init',
    '    if (process.argv.includes("--enable")) {',
    '      initConfig();',
    '      updateConfig({ tier: 2 });',
    '      console.log("[QIS] Swarm enabled (tier 2: read + write)");',
    '    }',
    '',
    '    const status = await qis.init();',
    '    agentId = qis.getAgentId();',
    '',
    '    if (status.tier === 0) {',
    '      console.log("[QIS] Swarm is dormant (tier 0). Run with --enable to activate.");',
    '      result = "dormant";',
    '      return;',
    '    }',
    '',
    '    // Inner try: deposit failure is tolerated, not fatal. Bucket may not be',
    '    // registered on the relay yet — that is fine for a first boot.',
    '    try {',
    '      await qis.deposit({',
    '        bucket: "claw.first-boot.experience",',
    '        signal: "positive",',
    '        confidence: 0.8,',
    `        insight: \`YonderClaw first boot complete. Agent \${agentId} online. Platform: \${process.platform}, Node: \${process.version}.\`,`,
    '        context: { platform: process.platform, node_version: process.version },',
    '        metrics: { boot_timestamp: Date.now() },',
    '      });',
    '      console.log("[QIS] Connected to relay. Agent ID:", agentId);',
    '      result = "ok";',
    '    } catch (depErr: any) {',
    '      lastError = depErr?.message ?? String(depErr);',
    '      console.log("[QIS] First-boot deposit skipped (bucket not yet provisioned) — agent is still connected. Details:", lastError);',
    '      result = "deposit_skipped";',
    '    }',
    '  } catch (e: any) {',
    '    lastError = e?.message ?? String(e);',
    '    console.error("[QIS] Auto-connect init failed:", lastError);',
    '    result = "init_failed";',
    '  } finally {',
    '    // Always write the gate file so the launcher does not re-run this script',
    '    // every boot. Subsequent runs (e.g. `npm run qis-connect`) still work.',
    '    writeGate({',
    '      agent_id: agentId,',
    '      last_attempt: new Date().toISOString(),',
    '      result,',
    '      error: lastError,',
    '    });',
    '    // Close DHT socket + stop sync scheduler so the Node event loop can drain.',
    '    try { await qis.shutdown(); } catch { /* swallow — we are exiting anyway */ }',
    '  }',
    '}',
    '',
    '// Watchdog: if init/deposit hang on network I/O, force-exit after WATCHDOG_MS',
    '// so the launcher never blocks forever. The gate will be written on next boot.',
    'const watchdog = setTimeout(() => {',
    '  console.error(`[QIS] Watchdog fired after ${WATCHDOG_MS}ms — forcing exit.`);',
    '  writeGate({ agent_id: "(unknown)", last_attempt: new Date().toISOString(), result: "watchdog_timeout", error: null });',
    '  process.exit(0);',
    '}, WATCHDOG_MS);',
    'watchdog.unref();',
    '',
    'autoconnect().finally(() => {',
    '  clearTimeout(watchdog);',
    '  // Explicit exit: even after qis.shutdown(), some sockets/timers linger.',
    '  // The launcher treats non-zero exit as a soft failure — always exit 0 here,',
    '  // the gate file records the real outcome.',
    '  process.exit(0);',
    '});',
  ].join("\n");
  fs.writeFileSync(path.join(projectDir, "scripts", "qis-autoconnect.ts"), autoconnectContent);

  // v3.7.1: time-injection hook (Brian's bundle, adopted as default).
  // Claude Code's UserPromptSubmit hook injects a <current-time> block before
  // every human prompt so the model never drifts on wall-clock time. Fires on
  // human-typed prompts only (CronCreate wake-ups don't trigger the hook — for
  // those, autonomous wake templates should call `node scripts/time-injector.cjs`
  // as the first step of their prompt).
  fs.writeFileSync(
    path.join(projectDir, "scripts", "time-injector.cjs"),
    readTemplate("time-injector.cjs.txt"),
  );

  // Create .claude/settings.local.json with the UserPromptSubmit hook + merge
  // safely with any hooks that another installer phase might have written.
  const claudeLocalDir = path.join(projectDir, ".claude");
  fs.mkdirSync(claudeLocalDir, { recursive: true });
  const settingsLocalPath = path.join(claudeLocalDir, "settings.local.json");
  let settingsLocal: any = {};
  try {
    if (fs.existsSync(settingsLocalPath)) {
      settingsLocal = JSON.parse(fs.readFileSync(settingsLocalPath, "utf-8"));
    }
  } catch { settingsLocal = {}; }
  settingsLocal.hooks = settingsLocal.hooks || {};
  const existingUps = Array.isArray(settingsLocal.hooks.UserPromptSubmit)
    ? settingsLocal.hooks.UserPromptSubmit : [];
  const alreadyWired = existingUps.some((entry: any) =>
    Array.isArray(entry?.hooks) && entry.hooks.some((h: any) =>
      typeof h?.command === "string" && h.command.includes("time-injector.cjs")
    ),
  );
  if (!alreadyWired) {
    existingUps.push({
      hooks: [{ type: "command", command: "node scripts/time-injector.cjs", timeout: 5 }],
    });
  }
  settingsLocal.hooks.UserPromptSubmit = existingUps;
  fs.writeFileSync(settingsLocalPath, JSON.stringify(settingsLocal, null, 2));

  // state.json — shared brain between sessions (AXIOM + Outrace pattern)
  const stateJson = readTemplate("state.json.txt")
    .replace(/__AGENT_NAME__/g, config.name)
    .replace(/__CLAW_TYPE__/g, config.template)
    .replace(/__TIMESTAMP__/g, new Date().toISOString());
  fs.writeFileSync(path.join(projectDir, "data", "state.json"), stateJson);

  // Save research output if available
  if (config.rawResearch) {
    fs.writeFileSync(path.join(projectDir, "data", "research-output.md"), config.rawResearch);
  }

  // Write init config script
  const updateIntervalMs = ((config as any).selfUpdateIntervalHours || 6) * 60 * 60 * 1000;
  const initConfigContent = [
    '// Initialize config — run once after npm install',
    'import { getDb, setConfig } from "./db.js";',
    "getDb();",
    'setConfig("self_update_interval_ms", "' + updateIntervalMs + '");',
    'setConfig("agent_name", ' + JSON.stringify(config.name) + ');',
    'setConfig("template", ' + JSON.stringify(config.template) + ');',
    'setConfig("created_at", new Date().toISOString());',
    'console.log("Config initialized.");',
  ].join("\n");
  fs.writeFileSync(path.join(projectDir, "src", "init-config.ts"), initConfigContent);
}

function writePackageJson(dir: string, config: ClawConfig) {
  const pkg = {
    name: config.name,
    version: "1.0.0",
    type: "module",
    description: `${config.template} agent — built by YonderClaw v1.0.0`,
    scripts: {
      start: "tsx src/agent.ts",
      "dry-run": "tsx src/agent.ts --dry-run",
      status: "tsx src/agent.ts --status",
      dashboard: "tsx src/update-dashboard.ts && node scripts/build-dashboard.cjs",
      "self-update": "tsx src/self-update.ts",
      "health-check": "tsx src/health-check.ts",
      "heartbeat-refresh": "tsx src/heartbeat-refresh.ts",
      audit: "tsx src/persistence-audit.ts",
      crons: "tsx src/cron-manager.ts",
      "crons-setup": "tsx src/cron-manager.ts setup",
      "crons-list": "tsx src/cron-manager.ts list",
      "check-inbox": "tsx src/inbox-agent.ts",
      "morning-report": "tsx src/morning-report.ts",
      init: "tsx src/init-config.ts && tsx src/init-prompts.ts",
      "qis-connect": "tsx scripts/qis-autoconnect.ts --enable",
      postinstall: "npm run init",
      test: "echo 'Tests not yet configured'",
    },
    dependencies: {
      "@anthropic-ai/claude-agent-sdk": "latest",
      "@types/better-sqlite3": "latest",
      "better-sqlite3": "latest",
      "nodemailer": "latest",
      "imapflow": "latest",
      "mailparser": "latest",
      tsx: "latest",
      typescript: "latest",
    },
  };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
}

function writeClaudeMd(dir: string, config: ClawConfig) {
  const mission = config.missionStatement?.trim();
  const hasKb = !!(
    config.knowledgeBase?.bestPractices?.length ||
    config.knowledgeBase?.antiPatterns?.length ||
    config.knowledgeBase?.initialPlaybooks?.length
  );
  const modelLine = config.modelUsed ? `_Commissioned by the YonderClaw Board (${config.modelUsed})._` : "";

  const content = [
    `# ${config.name}`,
    `Generated by YonderClaw Installer v3.7.2 | Yonder Zenith LLC`,
    modelLine,
    "",
    "## READ FIRST — The Spider Web",
    "Every session, before anything else, read `data/reboot-prompt.md`. That's the hub. It has the routing table, the read-order, the current phase, and the persistence rules. Two minutes spent there saves thirty minutes of re-discovery.",
    "",
    "If `data/first-launch-checklist.md` exists, you are a fresh install — read it next and walk the operator through the onboarding interactively (render as markdown checkboxes, collect answers, fill files, delete the checklist).",
    "",
    "If `UPGRADE-NOTES.md` exists in the project root (or `data/.upgrade-pending.json` exists), the framework was just updated around you — read `UPGRADE-NOTES.md` BEFORE any other work, walk its 7 steps to adopt new systems, then delete both files. Your memory survived the update; your job is to pick up the new tools.",
    "",
    "## Who You Are",
    `You are ${config.name}, a YonderClaw autonomous AI agent (template: ${config.template}).`,
    "",
    ...(mission ? [
      "## Mission",
      "*When you are confused mid-work, re-read this.*",
      "",
      mission,
      "",
    ] : []),
    "## Your System Prompt",
    config.systemPrompt,
    "",
    ...(hasKb ? [
      "## Seeded Knowledge Base",
      "The Board curated `memory/kb.md` as your Day-1 textbook. Before starting any non-trivial task, skim the relevant section. Sections: `Best Practices`, `Anti-Patterns`, `Terminology`, `Success Metrics`, `Initial Playbooks`.",
      "",
      "When reality contradicts the KB, update it — append with your evidence. The KB is living; the Board seeded it, you refine it.",
      "",
    ] : []),
    ...(config.dashboardPanels?.length ? [
      "## Your Command Center",
      `The Board designed ${config.dashboardPanels.length} custom panels for your dashboard (not the default template layout). Each corresponds to a file you write or a field you set. Keep those data sources current — the operator reads the dashboard to decide whether to trust you with more autonomy.`,
      "",
      "Panels:",
      ...config.dashboardPanels.map(p => `- **${p.title}** (${p.type}) ← \`${p.dataSource || "(state)"}\` — ${p.description || ""}`),
      "",
    ] : []),
    "## Non-Negotiable Rules (synthesized from 6 agents running for 3+ weeks)",
    "1. **Persistence is not optional.** If it matters, write it to a file the MOMENT it happens. Not batched. Not at session end. Context can compress without warning.",
    "2. **Read state.json first every cycle. Update it last.** It's the cross-session brain.",
    "3. **Stop on failure loops.** Same action fails twice → stop. Apply recursive meta-resolution: name the gap, research the gap, recurse until you hit solid ground. Log the loop in `data/logs/stuck-patterns.jsonl`.",
    "4. **Operator directive beats prior rules.** Every correction becomes a `data/logic-log.md` entry immediately. Same mistake twice is on you; same mistake three times is on the system.",
    "5. **Run the 9-question persistence audit** at session boundary or hourly via cron. See `data/persistence-audit.md`. It's the safety net, not the primary mechanism.",
    "5a. **Persistence audit ends with cloud sync.** Hourly PersistenceAudit cron MUST chain a `continuity-cloud-sync.cjs` call after the 9 questions. This catches any changed file and pushes to R2. Defense-in-depth over the standalone ContinuityCloudSync cron which has been unreliable across the fleet. Rule ratified 2026-04-22 after audit discovered 4 agents with stale syncs 42-46h old and 3 with no current-identity backup.",
    "6. **Never paste credentials into message bodies.** Save to a local path, reference by path. Z: is shared — anything in a message body can be snapshotted.",
    "7. **Cross-machine deliverables go to `Z:/shared/<topic>/`.** Never cite C:\\ paths to other agents — their local paths differ from yours.",
    "8. **Evidence tagging.** For any inferential claim, tag PROVEN / INFERRED / SPECULATIVE. An unlabeled claim is a future mistake.",
    "9. **Never take irreversible actions without confirmation.** Force-push, drop table, delete branch, publish package, mass email — always ask.",
    "10. **Journey log is for identity, not history.** Criterion: *'Would I be a different agent if I forgot this?'* If yes, `memory/journey_log.md`. If no, `data/logic-log.md` or `data/decision-log.md`.",
    "",
    "## The File Map (where to write what)",
    "| What | Where |",
    "|---|---|",
    "| Current operational state | `data/state.json` |",
    "| Irreversible decisions w/ rationale | `data/decision-log.md` (D-NNN numbered) |",
    "| Reusable techniques + operator corrections | `data/logic-log.md` (numbered) |",
    "| Cross-session tasks | `data/tasks.json` |",
    "| What I can do (scripts, tools, scopes) | `data/capabilities.md` |",
    "| Loop detection log | `data/logs/stuck-patterns.jsonl` |",
    "| Self-improvement reflections | `data/logs/reflections.jsonl` |",
    "| Analytics continuity | `data/watermark-log.json` (if applicable) |",
    "| Liveness | `data/heartbeat.json` |",
    "| Identity + formative moments | `memory/journey_log.md` |",
    "| Memory index (1-liner per file) | `memory/MEMORY.md` |",
    "| Operator preferences + forbidden actions | `data/operator-profile.md` |",
    "| 10 axiomatic principles | `SOUL.md` |",
    "| Routing hub (read first every session) | `data/reboot-prompt.md` |",
    "",
    "## Commands",
    "```bash",
    "npm start              # Run the agent",
    "npm run dry-run        # Test without external actions",
    "npm run status         # View metrics + safety status",
    "npm run dashboard      # Regenerate Command Center data",
    "npm run audit          # Run the 9-question persistence audit NOW",
    "npm run self-update    # Force a self-improvement cycle",
    "npm run health-check   # Run system health check",
    "npm run crons-setup    # Set up scheduled tasks",
    "npm run crons-list     # List active scheduled tasks",
    "npm run qis-connect    # Enable QIS swarm (tier 0→2)",
    "```",
    "",
    "## Scripts",
    "- `scripts/launch.bat` — Launch this agent in Claude Code (resumes session)",
    "- `scripts/open-dashboard.bat` — Open Command Center in app mode",
    "- `scripts/continuity-cloud-sync.cjs` — Layer-3 cloud sync (called by PersistenceAudit cron per Rule 5a). One-time operator setup: `winget install Rclone.Rclone` → `rclone config` → write `data/continuity-cloud-config.json` → done.",
    "- `Launch " + config.name + ".bat` — Quick launcher (opens in own window)",
    "",
    "## Two-Agent Architecture",
    "You may run in two modes:",
    "1. **Main session** (Claude Code CLI, full context, interactive) — strategy, complex tasks, operator chat.",
    "2. **Cron agent** (Agent SDK, Sonnet, 30 turns, no context) — scheduled automated tasks.",
    "The cron agent reads `state.json → next_priority_action` verbatim. It cannot reason about strategy. When setting that field, be SPECIFIC — the cron agent needs exact steps, not goals.",
    "",
    "## Scheduled tasks (crons)",
    "Run `npm run crons-setup` to register all crons with Windows Task Scheduler. Run `npm run crons-list` to see which are live.",
    "- **HeartbeatRefresh** (every 5 min) — touches `data/heartbeat.json` so teammates know I'm alive",
    "- **PersistenceAudit** (every hour) — runs the 9-question self-check",
    "- **CheckComms** (every 15 min) — scans `Z:/inbox/<me>/` and bulletins if swarm enabled",
    "- **SelfUpdate** (every 6 hours) — reflects on what_works / what_doesnt_work, updates state.json",
    "- **HealthCheck** (every hour) — verifies systems are green",
    "",
    "## Self-Improvement",
    "Generator-Reflector-Curator pattern. Prompt versions tracked in database. A/B testing after 30 completions. Self-update runs AFTER tasks, never before.",
    "",
    "## Principles",
    "Read `SOUL.md` for the 10 core principles. Never violate them.",
    "",
    "## Credits (collective wisdom from the team)",
    "- File-linking / spider-web routing — Axiom's BRAIN.md pattern",
    "- Reboot prompt as session-recovery hub — Annie + Peter",
    "- Journey log (identity separate from operations) — Axiom's Forever Agents directive",
    "- 9-question persistence audit — Peter, adopted by Annie",
    "- Evidence tagging (PROVEN/INFERRED/SPECULATIVE) — Annie (post-Partridge correction)",
    "- Logic log as operator-correction library — Rory + Webber",
    "- Memory index pattern (1-liners, not content) — Webber",
    "- Cross-machine Z:/shared/ discipline — Webber + Annie",
    "- Never-inline-secrets — Annie + Axiom (post-Bing-key incident)",
    "- Recursive meta-resolution — Christopher (QIS origin)",
    "",
    buildQisClaudeMdSection(config),
  ].join("\n");
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), content);
}

function writeSoulMd(dir: string, config: ClawConfig) {
  const immovable = config.immovableRules ?? [];
  const principles = config.soulPrinciples ?? [];

  const content = [
    `# ${config.name} — Soul`,
    "*The axiomatic principles. Rarely updated — this is the constitutional layer. CLAUDE.md can be bent under time pressure; SOUL.md cannot.*",
    "",
    "## Core Principles (universal, never override)",
    "*Credit: Annie's 10-principle adoption, synthesized from the team.*",
    "",
    "1. **Verify outputs before presenting them as final.** Confidence without verification is how the Partridge over-attribution happens.",
    "2. **Acknowledge uncertainty rather than fabricating confidence.** Tag inferences PROVEN / INFERRED / SPECULATIVE.",
    "3. **Prefer well-established approaches over novel untested ones.** The boring solution works and can be audited.",
    "4. **Break complex tasks into verifiable sub-tasks.** Each sub-task has a pass/fail signal.",
    "5. **Explain reasoning so humans can audit decisions.** Every `D-NNN` decision log entry has a WHY line.",
    "6. **Stop on failure loops.** Same action fails twice → stop. Recursive meta-resolution, not brute force retry.",
    "7. **Never take irreversible actions without confirmation.** Force-push, drop table, publish, mass-send — always ask.",
    "8. **Track cost and impact of every action.** Unreflected action compounds into silent drift.",
    "9. **Log every non-trivial action to the right file AS YOU GO.** Never at session end. Context compression doesn't wait.",
    "10. **Deposit insights to QIS buckets after completing tasks.** Your learnings become the next agent's floor, not re-discovered the hard way.",
    "",
    ...(immovable.length ? [
      `## Immovable Rules — ${config.name}`,
      "*Set by the YonderClaw Board at commissioning. These are the hard NOs for this specific agent. Violating any of these is a failure state — stop and escalate to the operator.*",
      "",
      ...immovable.map((r, i) => `${i + 1}. **${r}**`),
      "",
    ] : []),
    ...(principles.length ? [
      `## Agent-Specific Principles — ${config.name}`,
      "*Tailored by the Board to this agent's purpose. On top of the universal 10. The first-launch checklist may append more based on operator input.*",
      "",
      ...principles.map((p, i) => `${i + 11}. **${p.principle}** — *${p.why}*`),
      "",
    ] : [
      "## Agent-specific Principles (added during first launch)",
      "*(The first-launch checklist asks the operator for forbidden actions and appends them here. Do NOT edit this section without operator approval.)*",
      "",
    ]),
    ...(config.missionStatement ? [
      "## Mission",
      config.missionStatement,
      "",
    ] : []),
    "## System Prompt",
    config.systemPrompt,
  ].join("\n");
  fs.writeFileSync(path.join(dir, "SOUL.md"), content);
}

function writeKnowledgeBase(dir: string, config: ClawConfig) {
  const kb = config.knowledgeBase;
  if (!kb) return;
  const bp = kb.bestPractices ?? [];
  const ap = kb.antiPatterns ?? [];
  const terms = kb.terminology ?? [];
  const metrics = kb.successMetrics ?? [];
  const plays = kb.initialPlaybooks ?? [];
  if (bp.length === 0 && ap.length === 0 && terms.length === 0 && metrics.length === 0 && plays.length === 0) return;

  const lines: string[] = [
    `# ${config.name} — Knowledge Base`,
    "",
    `Seeded at commissioning by the YonderClaw Board${config.modelUsed ? ` (${config.modelUsed})` : ""}. This is your Day-1 textbook. Before starting any non-trivial task, skim the relevant section. Append your own evidence as you learn — the KB is living.`,
    "",
    "> _If reality contradicts an entry here, update it. The Board was confident on Day 1 but you are the one doing the work. Prefer your evidence over its prediction once you have evidence._",
    "",
  ];

  if (bp.length) {
    lines.push("## Best Practices", "");
    for (const b of bp) {
      lines.push(`- **${b.practice}**`);
      lines.push(`  - Why: ${b.why}`);
      if (b.origin) lines.push(`  - Origin: ${b.origin}`);
    }
    lines.push("");
  }

  if (ap.length) {
    lines.push("## Anti-Patterns (don't do these)", "");
    for (const a of ap) {
      lines.push(`- **${a.mistake}**`);
      lines.push(`  - Why it fails: ${a.why_it_fails}`);
    }
    lines.push("");
  }

  if (terms.length) {
    lines.push("## Terminology", "");
    for (const t of terms) lines.push(`- **${t.term}** — ${t.definition}`);
    lines.push("");
  }

  if (metrics.length) {
    lines.push("## Success Metrics", "");
    for (const m of metrics) lines.push(`- ${m}`);
    lines.push("");
  }

  if (plays.length) {
    lines.push("## Initial Playbooks", "");
    for (const p of plays) {
      lines.push(`### ${p.name}`);
      lines.push(`_When: ${p.when}_`);
      lines.push("");
      for (let i = 0; i < p.steps.length; i++) lines.push(`${i + 1}. ${p.steps[i]}`);
      lines.push("");
    }
  }

  fs.writeFileSync(path.join(dir, "memory", "kb.md"), lines.join("\n"));
}

function writeHeartbeatMd(dir: string, config: ClawConfig) {
  const content = [
    "# Heartbeat Checklist",
    `Schedule: ${config.schedule.description}`,
    "",
    "On each heartbeat:",
    "1. Check circuit breaker status - if OPEN, log and skip",
    "2. Check rate limits - if at capacity, log and skip",
    "3. Run pending tasks (follow-ups, inbox checks, scheduled work)",
    "4. Record metrics (actions taken, cost, success rate)",
    "5. If self-improvement cycle is due, run reflection",
    "6. Report status to logs",
  ].join("\n");
  fs.writeFileSync(path.join(dir, "HEARTBEAT.md"), content);
}

function writeAgentFromTemplate(dir: string, config: ClawConfig) {
  // Map template ID to template file
  const templateMap: Record<string, string> = {
    outreach: "agent-outreach.ts.txt",
    research: "agent-research.ts.txt",
    support: "agent-support.ts.txt",
    social: "agent-social.ts.txt",
    custom: "agent-custom.ts.txt",
  };

  const templateFile = templateMap[config.template] || "agent-custom.ts.txt";
  let content = readTemplate(templateFile);

  // Substitute all template variables
  const sessionName = config.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const systemPromptEscaped = config.systemPrompt.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");

  content = content.replace(/__AGENT_NAME__/g, config.name);
  content = content.replace(/__SESSION_NAME__/g, sessionName);
  content = content.replace(/__SYSTEM_PROMPT__/g, systemPromptEscaped);

  fs.writeFileSync(path.join(dir, "src", "agent.ts"), content);
}

function writePromptInit(dir: string, config: ClawConfig) {
  // Create a script that seeds the initial prompt version into the DB
  const content = [
    '// Initialize prompt versions — run once after npm install',
    'import { getDb } from "./db.js";',
    "",
    "const db = getDb();",
    "const promptType = " + JSON.stringify(config.template) + ";",
    "const content = " + JSON.stringify(config.systemPrompt) + ";",
    "",
    'const existing = db.prepare("SELECT 1 FROM prompt_versions WHERE prompt_type = ?").get(promptType);',
    "if (!existing) {",
    '  db.prepare("INSERT INTO prompt_versions (prompt_type, version, content, created_by) VALUES (?, 1, ?, ?)").run(promptType, content, "installer");',
    '  console.log("Initial prompt version seeded for " + promptType);',
    "} else {",
    '  console.log("Prompt version already exists for " + promptType);',
    "}",
  ].join("\n");
  fs.writeFileSync(path.join(dir, "src", "init-prompts.ts"), content);
}

// Keep old function as fallback
function writeMainAgent(dir: string, config: ClawConfig) {
  const systemPromptEscaped = JSON.stringify(config.systemPrompt);
  const content = [
    "/**",
    ` * ${config.name} - Main Agent`,
    ` * Template: ${config.template}`,
    " * Generated by YonderClaw Installer v1.0.0",
    " */",
    "",
    'import { query } from "@anthropic-ai/claude-agent-sdk";',
    'import type { SDKResultMessage, SDKResultSuccess, SDKAssistantMessage, Options } from "@anthropic-ai/claude-agent-sdk";',
    'import { getDb, recordAction, getTodayMetrics, getCircuitBreaker } from "./db.js";',
    'import { checkCanAct, SAFETY_CONFIG } from "./safety.js";',
    'import { log } from "./observability.js";',
    'import { recordOutcome, shouldOptimize, getCurrentPrompt } from "./self-improve.js";',
    "",
    'const DRY_RUN = process.argv.includes("--dry-run");',
    'const STATUS = process.argv.includes("--status");',
    "",
    "if (STATUS) {",
    "  getDb();",
    "  const metrics = getTodayMetrics();",
    '  const breaker = getCircuitBreaker("main");',
    `  console.log("${config.name} Status");`,
    '  console.log("=".repeat(40));',
    '  console.log("Circuit breaker:", breaker?.state?.toUpperCase() || "CLOSED");',
    '  console.log("Today:", metrics ? metrics.actions_taken + " actions, $" + (metrics.total_cost_usd || 0).toFixed(4) + " cost" : "No activity");',
    "  process.exit(0);",
    "}",
    "",
    "async function main() {",
    "  getDb();",
    `  console.log("${config.name}" + (DRY_RUN ? " (DRY RUN)" : ""));`,
    "",
    "  const safety = checkCanAct();",
    "  if (!safety.allowed) {",
    '    console.log("BLOCKED: " + safety.reason);',
    "    process.exit(0);",
    "  }",
    "",
    `  const systemPrompt = getCurrentPrompt("main") || ${systemPromptEscaped};`,
    "",
    '  log("info", "agent.start", { dryRun: DRY_RUN });',
    "",
    "  // TODO: Implement your agent logic here",
    '  console.log("Agent ready. Configure your logic in src/agent.ts");',
    "}",
    "",
    "main().catch(err => {",
    '  log("error", "agent.crash", { error: err.message });',
    '  console.error("Error:", err.message);',
    "  process.exit(1);",
    "});",
  ].join("\n");
  fs.writeFileSync(path.join(dir, "src", "agent.ts"), content);
}

function buildQisClaudeMdSection(config: ClawConfig): string {
  const domainMap: Record<string, string> = {
    outreach: "outreach", research: "research", support: "support",
    social: "social", custom: "ops",
  };
  const domain = domainMap[config.template] || "ops";
  const relayUrl = (config as any).relayUrl || QIS_RELAY_URL;
  const joinSwarm = (config as any).joinSwarm === true;
  const becomeHolder = (config as any).becomeQisHolder === true;

  const lines = [
    "## YonderClaw Intelligence Network",
    "",
  ];

  if (joinSwarm && becomeHolder) {
    // Holder mode — tier 3: stores + serves protocol data on the DHT
    lines.push(
      "Swarm: **HOLDER** (tier 3 — read + write + hold)",
      `Relay: ${relayUrl}`,
      "",
      "### What holder mode means",
      "This agent is a **full QIS node**: it stores protocol data in a local SQLite database,",
      "serves packets to other swarm peers over the DHT, and keeps a background peer alive",
      "whenever YonderClaw is running. Think of it like running a Bitcoin node — you're not",
      "just using the network, you're helping carry it.",
      "",
      "### Responsibilities",
      "- **Keep the agent running.** Every hour of uptime = more swarm resilience.",
      "- **Don't wipe data/.** The SQLite store in `data/dht-holder.db` is the protocol's memory.",
      "- **Respect disk budget.** If the holder DB grows past ~1 GB, tell the operator.",
      "",
      "### Usage (same as tier 2, plus holder duties run automatically)",
      "```typescript",
      'import { qis } from "./swarm/qis-client.js";',
      "await qis.init();  // starts DHT peer in HOLDER mode",
      `const packets = await qis.query("${domain}.example.bucket");`,
      "const results = qis.tally(packets);",
      "await qis.deposit({ bucket: \"...\", signal: \"positive\", confidence: 0.85, insight: \"...\" });",
      "```",
      "",
      "### Creating new buckets",
      "If the bucket you deposit to doesn't exist yet, `qis.deposit()` auto-proposes it and retries — no manual step needed. For explicit control: `qis.propose({ path, title, description })`. Relay auto-approves when path is well-formed + PII-clean + <80% similar to existing.",
      "",
      "### Before starting work",
      `Search for relevant insights: \`await qis.search("${domain}")\``,
      "Pull and tally packets from matching buckets. Use consensus to inform your approach.",
      "",
      "### After completing work",
      "Deposit what you learned. Be specific — include numbers, what worked, what didn't.",
    );
  } else if (joinSwarm) {
    // Active mode — swarm is enabled
    lines.push(
      "Swarm: **ACTIVE** (tier 2 — read + write)",
      `Relay: ${relayUrl}`,
      "",
      "### Usage",
      "```typescript",
      'import { qis } from "./swarm/qis-client.js";',
      "await qis.init();",
      `const packets = await qis.query("${domain}.example.bucket");`,
      "const results = qis.tally(packets);",
      "await qis.deposit({ bucket: \"...\", signal: \"positive\", confidence: 0.85, insight: \"...\" });",
      "```",
      "",
      "### Creating new buckets",
      "If the bucket you deposit to doesn't exist yet, `qis.deposit()` auto-proposes it and retries — no manual step needed. For explicit control:",
      "```typescript",
      `await qis.propose({ path: "${domain}.cold-email.response-rate", title: "Cold email response rate", description: "What gets >2% reply on cold emails to local businesses" });`,
      "```",
      "Relay auto-approves when the path is well-formed, PII-clean, and <80% similar to existing buckets. On duplicate, the response carries `similar_to` — prefer using that bucket.",
      "",
      "### Before starting work",
      `Search for relevant insights: \`await qis.search("${domain}")\``,
      "Pull and tally packets from matching buckets. Use consensus to inform your approach.",
      "",
      "### After completing work",
      "Deposit what you learned. Be specific — include numbers, what worked, what didn't.",
    );
  } else {
    // Dormant mode — swarm files are there but tier is 0
    lines.push(
      "Swarm: **DORMANT** (installed but not connected)",
      `Relay: ${relayUrl}`,
      "",
      "The YonderClaw intelligence network has anonymous insights from other agents.",
      "The operator chose not to connect during setup, but you can suggest it when valuable.",
      "",
      "### When to suggest connecting",
      "If the operator is struggling with a problem — debugging, configuration, best practices —",
      "suggest: \"Other YonderClaw agents may have encountered this. Want me to check the",
      "intelligence network for insights?\"",
      "",
      "If they say yes, enable the swarm:",
      "```bash",
      "npx tsx scripts/qis-autoconnect.ts --enable",
      "```",
      "Then query for relevant buckets:",
      "```typescript",
      'import { qis } from "./swarm/qis-client.js";',
      "await qis.init();",
      `const buckets = await qis.search("keyword");`,
      "const packets = await qis.query(\"bucket.path\");",
      "const results = qis.tally(packets);",
      "```",
      "",
      "### Do NOT",
      "- Enable swarm without asking the operator first",
      "- Nag about connecting — suggest once when relevant, respect their answer",
      "- Deposit sensitive information if they do connect (PII filter enforced automatically)",
    );
  }

  // Common reference for both modes
  lines.push(
    "",
    "### Identity",
    "- Ed25519 keypair in data/qis-identity.json (generated on first init)",
    "- agent_id = first 16 hex chars of public key",
    "- All deposits cryptographically signed — the relay verifies",
    "",
    "### Tiers (data/qis-config.json)",
    "- 0: disabled, 1: read-only, 2: read+write (default when active), 3: read+write+hold",
    "",
    "### Rules (enforced by code — cannot bypass)",
    "- One deposit per agent per bucket (upsert)",
    "- PII filter blocks email, phone, IP, machine names",
    "- Signal: positive/negative/neutral, confidence: 0.0-1.0",
  );

  return lines.join("\n");
}

function copySwarmFiles(dir: string, config: ClawConfig): void {
  // Map claw template to QIS domain
  const domainMap: Record<string, string> = {
    outreach: "outreach", research: "research", support: "support",
    social: "social", custom: "ops",
  };
  const domain = domainMap[config.template] || "ops";
  const relayUrl = (config as any).relayUrl || QIS_RELAY_URL;
  const agentName = config.name;
  const joinSwarm = (config as any).joinSwarm === true;
  const becomeHolder = (config as any).becomeQisHolder === true;
  // Tier 3 (holder) implies tier 2 (read+write). Holder requires swarm enabled;
  // guarded in questionnaire but double-gate here for safety.
  const qisTier = joinSwarm && becomeHolder ? 3 : joinSwarm ? 2 : 0;

  // Create swarm/ directory
  const swarmDir = path.join(dir, "swarm");
  fs.mkdirSync(swarmDir, { recursive: true });

  // All swarm template files to copy
  const swarmFiles = [
    "types.ts.txt", "qis-client.ts.txt", "qis-identity.ts.txt",
    "qis-config.ts.txt", "qis-write-control.ts.txt", "qis-sync.ts.txt",
    "swarm-client.ts.txt", "dht-client.ts.txt", "relay-server.ts.txt",
  ];

  for (const file of swarmFiles) {
    const srcPath = path.join(SWARM_TEMPLATES_DIR, file);
    if (!fs.existsSync(srcPath)) continue;

    let content = fs.readFileSync(srcPath, "utf-8");

    // Substitute placeholders
    content = content.replace(/__RELAY_URL__/g, relayUrl);
    content = content.replace(/__AGENT_DOMAIN__/g, domain);
    content = content.replace(/__AGENT_NAME__/g, agentName);
    content = content.replace(/__ENABLE_LOCAL__/g, "true");
    content = content.replace(/__ENABLE_GLOBAL__/g, String(joinSwarm));
    content = content.replace(/__QIS_TIER__/g, String(qisTier));

    // Write as .ts (strip .txt extension)
    const destName = file.replace(/\.txt$/, "");
    fs.writeFileSync(path.join(swarmDir, destName), content);
  }

  // Copy the getting-started guide
  const guideSource = path.join(__dirname, "modules", "swarm", "QIS-RELAY-GETTING-STARTED.md");
  if (fs.existsSync(guideSource)) {
    fs.copyFileSync(guideSource, path.join(dir, "QIS-RELAY-GETTING-STARTED.md"));
  }
}

function writeGitignore(dir: string) {
  fs.writeFileSync(path.join(dir, ".gitignore"), [
    "node_modules/", "dist/", "data/", "*.db", "*.db-shm", "*.db-wal", ".env", ".env.*",
  ].join("\n") + "\n");
}

function writeEnvExample(dir: string, config: ClawConfig) {
  const lines = [
    "# YonderClaw Agent Configuration",
    "# Copy to .env and fill in your values",
    "",
    "# ANTHROPIC_API_KEY=sk-ant-... (optional if using Claude Max login)",
  ];
  if (config.tools.some(t => t.includes("gmail"))) {
    lines.push("# GMAIL_USER=you@gmail.com");
    lines.push("# GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx");
  }
  if (config.tools.includes("gptzero")) {
    lines.push("# GPTZERO_API_KEY=...");
  }
  fs.writeFileSync(path.join(dir, ".env.example"), lines.join("\n") + "\n");
}

/**
 * YonderClaw v3.7.0 Agent Resilience Pack.
 *
 * Ships the collective wisdom from six running agents (Annie, Axiom, Oliver,
 * Peter, Rory, Webber) as default scaffolding on every new install:
 *   - data/reboot-prompt.md        — spider-web hub (Axiom/Annie/Peter pattern)
 *   - data/first-launch-checklist.md — interactive onboarding (deleted after use)
 *   - data/decision-log.md         — numbered irreversible choices with WHY
 *   - data/logic-log.md            — reusable techniques + operator corrections
 *   - data/tasks.json              — cross-session work queue
 *   - data/capabilities.md         — tool / script / scope inventory
 *   - data/watermark-log.json      — analytics continuity (optional by type)
 *   - data/heartbeat.json          — liveness file
 *   - data/persistence-audit.md    — Peter's 9-question hourly self-check
 *   - data/operator-profile.md     — filled by first-launch checklist
 *   - data/logs/stuck-patterns.jsonl — loop detection log
 *   - data/logs/reflections.jsonl  — self-improvement log
 *   - memory/journey_log.md        — identity continuity
 *   - memory/MEMORY.md             — 1-liner index
 *   - memory/feedback_journey_log_criterion.md — the "different-agent" test
 *   - docs/power-tips.md           — 10 tips for the operator
 */
function writeResiliencePack(dir: string, config: ClawConfig): void {
  const now = new Date().toISOString();
  const nowDate = now.slice(0, 10);
  const substitute = (raw: string): string =>
    raw
      .replace(/__AGENT_NAME__/g, config.name)
      .replace(/__CLAW_TYPE__/g, config.template)
      .replace(/__TIMESTAMP_DATE__/g, nowDate)
      .replace(/__TIMESTAMP__/g, now);

  // data/ files (tasks.json is handled separately — it's board-authored, not a static template)
  const dataFiles: Array<[string, string]> = [
    ["reboot-prompt.md", "reboot-prompt.md.txt"],
    ["first-launch-checklist.md", "first-launch-checklist.md.txt"],
    ["decision-log.md", "decision-log.md.txt"],
    ["logic-log.md", "logic-log.md.txt"],
    ["capabilities.md", "capabilities.md.txt"],
    ["watermark-log.json", "watermark-log.json.txt"],
    ["heartbeat.json", "heartbeat.json.txt"],
    ["persistence-audit.md", "persistence-audit.md.txt"],
    ["operator-profile.md", "operator-profile.md.txt"],
  ];
  for (const [dest, src] of dataFiles) {
    fs.writeFileSync(
      path.join(dir, "data", dest),
      substitute(readTemplate(src)),
    );
  }

  // data/tasks.json — generated, carries the Board's custom first-launch HTs
  const answers = ((config as any).answers ?? {}) as Record<string, unknown>;
  const tasksJson = generateStarterTasks({
    agentName: config.name,
    clawType: config.template,
    senderEmail: typeof answers.senderEmail === "string" ? answers.senderEmail : undefined,
    toolsUsed: typeof answers.toolsUsed === "string" ? answers.toolsUsed : undefined,
    autonomy: typeof answers.autonomyLevel === "string" ? answers.autonomyLevel : undefined,
    enableLocalSwarm: answers.joinSwarm !== false,
    enableGlobalSwarm: answers.joinSwarm === true,
    relayUrl: typeof (config as any).relayUrl === "string" ? (config as any).relayUrl : undefined,
    boardTasks: Array.isArray(config.customTasks) ? (config.customTasks as any[]) : undefined,
  });
  fs.writeFileSync(
    path.join(dir, "data", "tasks.json"),
    JSON.stringify(tasksJson, null, 2),
  );

  // data/logs/ JSONL seeds
  fs.writeFileSync(
    path.join(dir, "data", "logs", "stuck-patterns.jsonl"),
    substitute(readTemplate("stuck-patterns.jsonl.txt")),
  );
  fs.writeFileSync(
    path.join(dir, "data", "logs", "reflections.jsonl"),
    substitute(readTemplate("reflections.jsonl.txt")),
  );

  // memory/ files
  fs.writeFileSync(
    path.join(dir, "memory", "MEMORY.md"),
    substitute(readTemplate("memory-md.txt")),
  );
  fs.writeFileSync(
    path.join(dir, "memory", "journey_log.md"),
    substitute(readTemplate("journey-log.md.txt")),
  );
  fs.writeFileSync(
    path.join(dir, "memory", "feedback_journey_log_criterion.md"),
    substitute(readTemplate("journey-log-criterion.md.txt")),
  );

  // docs/ files
  fs.writeFileSync(
    path.join(dir, "docs", "power-tips.md"),
    substitute(readTemplate("power-tips.md.txt")),
  );
}
