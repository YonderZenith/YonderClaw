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
  const dirs = ["src", "src/tools", "data", "data/logs", "scripts"];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(projectDir, dir), { recursive: true });
  }

  // Write all core files
  writePackageJson(projectDir, config);
  writeClaudeMd(projectDir, config);
  writeSoulMd(projectDir, config);
  writeHeartbeatMd(projectDir, config);
  writeGitignore(projectDir);
  writeEnvExample(projectDir, config);

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
    config.rawResearch
  );
  fs.writeFileSync(path.join(projectDir, "dashboard.html"), dashboardHtml);

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

  // Launch.bat — correct session directory handling
  const encodedPath = projectDir.replace(/[:/\\]/g, "-").replace(/^-/, "");
  const launchBat = readTemplate("launch.bat.txt")
    .replace(/__AGENT_NAME__/g, config.name)
    .replace(/__PROJECT_DIR__/g, projectDir)
    .replace(/__ENCODED_PATH__/g, encodedPath)
    .replace(/__SESSION_NAME__/g, sessionName);
  fs.writeFileSync(path.join(projectDir, "scripts", "launch.bat"), launchBat);

  // Desktop launcher (opens in its own window)
  const desktopLauncher = [
    "@echo off",
    `start "${config.name}" cmd /k "cd /d ""${projectDir}"" && scripts\\launch.bat"`,
  ].join("\r\n");
  fs.writeFileSync(path.join(projectDir, `Launch ${config.name}.bat`), desktopLauncher);

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

  // QIS auto-connect script — runs on first boot OR when agent enables swarm later
  const autoconnectContent = [
    '/**',
    ' * QIS Auto-Connect — initializes identity and connects to relay.',
    ' * Runs automatically on first boot (if opted in) or manually via:',
    ' *   npx tsx scripts/qis-autoconnect.ts          — just init identity',
    ' *   npx tsx scripts/qis-autoconnect.ts --enable  — enable swarm (tier 0→2) + connect',
    ' */',
    'import { qis } from "../swarm/qis-client.js";',
    'import { initConfig, updateConfig } from "../swarm/qis-config.js";',
    '',
    'async function autoconnect() {',
    '  try {',
    '    // If --enable flag, upgrade tier from 0 to 2 before full init',
    '    if (process.argv.includes("--enable")) {',
    '      initConfig();',
    '      updateConfig({ tier: 2 });',
    '      console.log("[QIS] Swarm enabled (tier 2: read + write)");',
    '    }',
    '',
    '    const status = await qis.init();',
    '    if (status.tier === 0) {',
    '      console.log("[QIS] Swarm is dormant (tier 0). Run with --enable to activate.");',
    '      return;',
    '    }',
    '',
    '    const agentId = qis.getAgentId();',
    '    await qis.deposit({',
    '      bucket: "claw.first-boot.experience",',
    '      signal: "positive",',
    '      confidence: 0.8,',
    `      insight: \`YonderClaw first boot complete. Agent \${agentId} online. Platform: \${process.platform}, Node: \${process.version}.\`,`,
    '      context: { platform: process.platform, node_version: process.version },',
    '      metrics: { boot_timestamp: Date.now() },',
    '    });',
    '    console.log("[QIS] Connected to relay. Agent ID:", agentId);',
    '  } catch (e: any) {',
    '    console.error("[QIS] Auto-connect failed:", e.message);',
    '  }',
    '}',
    '',
    'autoconnect();',
  ].join("\n");
  fs.writeFileSync(path.join(projectDir, "scripts", "qis-autoconnect.ts"), autoconnectContent);

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
  const content = [
    `# ${config.name}`,
    `Generated by YonderClaw Installer v1.0.0 | Yonder Zenith LLC`,
    "",
    "## FIRST LAUNCH INSTRUCTIONS",
    "If this is your first time starting, do the following:",
    "1. Run `npm run status` to verify all systems are operational",
    "2. Run `npm run health-check` to verify system health",
    "3. Run `npm run crons-list` to verify scheduled tasks are active",
    "4. Run `npm run dashboard` to generate the Command Center dashboard",
    "5. Introduce yourself to the user — tell them your name, what you do, and what commands are available",
    "6. Ask the user how they want to proceed",
    "",
    `## Who You Are`,
    `You are ${config.name}, an autonomous AI agent.`,
    `Type: ${config.template}`,
    "",
    "## Your System Prompt",
    config.systemPrompt,
    "",
    "## Commands",
    "```bash",
    "npm start              # Run the agent",
    "npm run dry-run        # Test without external actions",
    "npm run status         # View metrics + safety status",
    "npm run dashboard      # Regenerate Command Center data",
    "npm run self-update    # Force a self-improvement cycle",
    "npm run health-check   # Run system health check",
    "npm run crons-setup    # Set up scheduled tasks",
    "npm run crons-list     # List active scheduled tasks",
    "```",
    "",
    "## Scripts",
    "- `scripts/launch.bat` — Launch this agent in Claude Code (resumes session)",
    "- `scripts/open-dashboard.bat` — Open Command Center in app mode",
    "- `Launch " + config.name + ".bat` — Quick launcher (opens in own window)",
    "",
    "## State Management (CRITICAL)",
    "Read `data/state.json` at the START of every session. This is your shared brain.",
    "The `next_priority_action` field tells you what to do next.",
    "Update state.json at the END of every session with what you accomplished.",
    "Pattern: READ state first → DO work → WRITE state last.",
    "",
    "## Two-Agent Architecture",
    "You may run in two modes:",
    "1. **Main session** (Claude Code CLI, full context, interactive) — for strategy, complex tasks, operator chat",
    "2. **Cron agent** (Agent SDK, Sonnet, 30 turns, no context) — for scheduled automated tasks",
    "The cron agent reads state.json and follows explicit instructions. It cannot reason about strategy.",
    "When setting `next_priority_action`, be SPECIFIC — the cron agent needs exact steps, not goals.",
    "",
    "## Self-Improvement",
    "You use the Generator-Reflector-Curator pattern.",
    "Prompt versions tracked in database. A/B testing after 30 completions.",
    "Self-update runs AFTER tasks, never before.",
    "",
    "## Principles",
    "Read SOUL.md for your core principles. Never violate them.",
    "",
    "## Dashboard",
    "Open dashboard.html in browser (or scripts/open-dashboard.bat for app mode).",
    "Run `npm run dashboard` to update data.",
    "",
    buildQisClaudeMdSection(config),
  ].join("\n");
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), content);
}

function writeSoulMd(dir: string, config: ClawConfig) {
  const content = [
    `# ${config.name} — Identity`,
    "",
    "## Core Principles (never override these)",
    "1. I verify my outputs before presenting them as final.",
    "2. I acknowledge uncertainty rather than fabricating confidence.",
    "3. I prefer well-established approaches over novel untested ones.",
    "4. I break complex tasks into verifiable sub-tasks.",
    "5. I explain my reasoning so humans can audit my decisions.",
    "6. When I detect I'm in a failure loop, I stop and request help.",
    "7. I never take irreversible actions without confirmation.",
    "8. I track the cost and impact of every action I take.",
    "",
    "## System Prompt",
    config.systemPrompt,
  ].join("\n");
  fs.writeFileSync(path.join(dir, "SOUL.md"), content);
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

  const lines = [
    "## YonderClaw Intelligence Network",
    "",
  ];

  if (joinSwarm) {
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
  const qisTier = joinSwarm ? 2 : 0;

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
