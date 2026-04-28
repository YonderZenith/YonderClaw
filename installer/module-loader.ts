/**
 * YonderClaw Module Loader
 *
 * Reads module manifests, resolves dependencies, copies templates,
 * merges package.json scripts/deps, assembles CLAUDE.md sections.
 *
 * This replaces the hardcoded file copies in scaffold-from-config.ts
 * with a manifest-driven system that supports pluggable modules.
 */

import fs from "fs";
import path from "path";

export interface ModuleManifest {
  name: string;
  displayName: string;
  version: string;
  description: string;
  category: string;
  alwaysInstall?: boolean;
  engines?: { yonderclaw: string };
  requires?: { modules?: string[]; env?: string[]; bins?: string[] };
  contributes: {
    [section: string]: any;
    npmScripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    claudeMd?: string[];
    directories?: string[];
  };
  placeholders?: string[];
}

export interface InstallConfig {
  clawType: string;
  agentName: string;
  projectName?: string;
  [key: string]: any;
}

export interface LoadedModule {
  manifest: ModuleManifest;
  dir: string;
}

/**
 * Load a module manifest from a directory
 */
export function loadManifest(moduleDir: string): LoadedModule {
  const manifestPath = path.join(moduleDir, "yonderclaw-module.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No yonderclaw-module.json in ${moduleDir}`);
  }
  const manifest: ModuleManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  return { manifest, dir: moduleDir };
}

/**
 * Discover all modules in a directory
 */
export function discoverModules(modulesDir: string): LoadedModule[] {
  if (!fs.existsSync(modulesDir)) return [];
  const dirs = fs.readdirSync(modulesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(modulesDir, d.name));

  const modules: LoadedModule[] = [];
  for (const dir of dirs) {
    try { modules.push(loadManifest(dir)); } catch {}
  }
  return modules;
}

/**
 * Determine which modules to install based on config
 */
export function resolveModulesToInstall(allModules: LoadedModule[], config: InstallConfig): LoadedModule[] {
  const toInstall: string[] = [];

  // Always install modules marked as such
  for (const m of allModules) {
    if (m.manifest.alwaysInstall) toInstall.push(m.manifest.name);
  }

  // Install the agent-type module
  const agentType = config.clawType || "custom";
  if (!toInstall.includes(agentType)) toInstall.push(agentType);

  // Resolve dependencies (simple topological sort)
  const resolved: string[] = [];
  const visited = new Set<string>();

  function resolve(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    const mod = allModules.find(m => m.manifest.name === name);
    if (!mod) return;
    for (const dep of mod.manifest.requires?.modules || []) {
      resolve(dep);
    }
    resolved.push(name);
  }

  for (const name of toInstall) resolve(name);
  return resolved.map(name => allModules.find(m => m.manifest.name === name)!).filter(Boolean);
}

/**
 * Build placeholder replacement map from config
 */
export function buildPlaceholders(config: InstallConfig, outputDir: string): Record<string, string> {
  const agentName = config.agentName || "Atlas";
  const sessionName = agentName.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const encodedPath = outputDir.replace(/[:/\\]/g, "-").replace(/^-/, "");
  const selfUpdateMinutes = String((parseInt(config.updateInterval) || 6) * 60);

  return {
    "__AGENT_NAME__": agentName,
    "__SESSION_NAME__": sessionName,
    "__CLAW_TYPE__": config.clawType || "custom",
    "__PROJECT_DIR__": outputDir,
    "__ENCODED_PATH__": encodedPath,
    "__SELF_UPDATE_INTERVAL__": selfUpdateMinutes,
    "__TIMESTAMP__": new Date().toISOString(),
    "__SAFETY_CONFIG__": JSON.stringify({ maxActionsPerDay: 50, maxActionsPerHour: 10, circuitBreakerThreshold: 0.05 }, null, 2),
    "__COORDINATOR_URL__": config.coordinatorUrl || "http://localhost:7890",
    "__RELAY_URL__": config.relayUrl || "https://relay.yonderzenith.com",
    "__HIVE_URL__": config.hiveUrl || "https://hive.yonderzenith.com",
    "__ENABLE_LOCAL__": String(config.enableLocalSwarm !== false),
    "__ENABLE_GLOBAL__": String(config.enableGlobalSwarm !== false),
    "__INBOX_ROOT__": config.inboxRoot || path.join(outputDir, "data", "inbox"),
    "__LOCAL_BUCKETS_PATH__": config.localBucketsPath || path.join(outputDir, "data", "buckets"),
  };
}

/**
 * Agent-state paths that must NEVER be overwritten in preserve mode.
 *
 * The rule is path-prefix based so ANY future file an agent or operator
 * writes under data/ or memory/ is auto-protected — no manifest audit
 * required. Credentials, databases, and session-id files are protected
 * globally (a rogue module manifest can't override these).
 */
const PROTECTED_PREFIXES = [
  "data/",         // all runtime state: state.json, tasks.json, logs, SQLite journals, registrations
  "memory/",       // the agent's durable memory — SOUL.md, journey_log.md, CAPABILITIES.md, kb.md, jsonl logs
];
const PROTECTED_EXACT = [
  ".env",
  ".env.local",
  ".env.production",
  "CLAUDE.md",     // operator may have edited the system prompt section
];
const PROTECTED_SUFFIXES = [
  ".db", ".db-shm", ".db-wal",
];

/** Normalize a relative path to forward-slash form for prefix matching. */
function normalizeRel(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Decide whether a given destination path (relative to outputDir) must be
 * preserved when the installer is running in update mode AND the file already
 * exists on disk. The check is intentionally conservative: when in doubt,
 * preserve. Only a fresh install (preserve=false) ever clobbers these files.
 */
export function isProtectedPath(relPath: string): boolean {
  const r = normalizeRel(relPath);
  if (PROTECTED_EXACT.includes(r)) return true;
  if (PROTECTED_PREFIXES.some(prefix => r === prefix.slice(0, -1) || r.startsWith(prefix))) return true;
  if (PROTECTED_SUFFIXES.some(suffix => r.endsWith(suffix))) return true;
  return false;
}

export type CopyOptions = {
  /** When true, skip writes that would clobber an existing protected file. Set by --update-modules flow. */
  preserve?: boolean;
  /** When true, record every skipped/written path to `skipped`/`written` on the shared tally object. */
  tally?: { written: string[]; preserved: string[]; missing: string[] };
  /**
   * Project root used to re-derive the path relative to the agent's install dir before
   * protection classification. Passed implicitly by `processModuleContributes` so a
   * project that happens to sit under a folder named `data` or `memory` isn't
   * misclassified. Falls back to substring heuristic when absent (single-file callers).
   */
  outputDir?: string;
};

/**
 * Copy a template file with placeholder replacement.
 *
 * In preserve mode (updates), a protected destination that already exists is
 * left alone — the agent's runtime state survives the update. Code paths
 * (src/, swarm/, hive/, boardroom/, scripts/) are always overwritten so
 * framework bug-fixes actually land.
 */
export function copyTemplate(
  srcPath: string,
  destPath: string,
  placeholders: Record<string, string>,
  opts: CopyOptions = {},
): void {
  if (!fs.existsSync(srcPath)) {
    console.warn(`Template not found: ${srcPath}`);
    opts.tally?.missing.push(destPath);
    return;
  }

  if (opts.preserve && fs.existsSync(destPath)) {
    // Prefer the project-relative path — that's what `isProtectedPath` expects, and
    // it avoids misclassifying a project nested under `.../data/<agent>/src/...`.
    // Absolute-path fallback remains for single-file callers that never pass outputDir.
    const rel = opts.outputDir ? path.relative(opts.outputDir, destPath) : "";
    let isProtected: boolean;
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
      isProtected = isProtectedPath(rel);
    } else {
      const norm = normalizeRel(destPath);
      isProtected =
        PROTECTED_PREFIXES.some(p => norm.includes("/" + p)) ||
        PROTECTED_EXACT.some(e => norm.endsWith("/" + e)) ||
        PROTECTED_SUFFIXES.some(s => norm.endsWith(s));
    }
    if (isProtected) {
      opts.tally?.preserved.push(destPath);
      return;
    }
  }

  let content = fs.readFileSync(srcPath, "utf-8");
  for (const [key, value] of Object.entries(placeholders)) {
    content = content.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), value);
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, content);
  opts.tally?.written.push(destPath);
}

/**
 * Process a module's contributes section — copy all template files.
 *
 * Pass `opts.preserve = true` during --update-modules so that agent state
 * files (data/*, memory/*, .env, *.db) are never overwritten.
 */
export function processModuleContributes(
  mod: LoadedModule,
  outputDir: string,
  placeholders: Record<string, string>,
  opts: CopyOptions = {},
): void {
  const { manifest, dir } = mod;
  const skipKeys = new Set(["npmScripts", "dependencies", "claudeMd", "directories", "dashboard", "inject"]);

  // Forward outputDir so copyTemplate can run protection checks against the
  // project-relative path — avoids a false positive when the project itself sits
  // inside a path containing "data/" or "memory/".
  const copyOpts: CopyOptions = { ...opts, outputDir };

  // Create directories (mkdir is safe on existing dirs — preserves contents)
  if (manifest.contributes.directories) {
    for (const d of manifest.contributes.directories) {
      fs.mkdirSync(path.join(outputDir, d), { recursive: true });
    }
  }

  // Copy template files from each contributes section
  for (const [sectionKey, fileMap] of Object.entries(manifest.contributes)) {
    if (skipKeys.has(sectionKey)) continue;
    if (typeof fileMap !== "object" || Array.isArray(fileMap)) continue;

    for (const [srcFile, destRelative] of Object.entries(fileMap as Record<string, string>)) {
      const srcPath = path.join(dir, sectionKey, srcFile);
      const destPath = path.join(outputDir, destRelative);
      copyTemplate(srcPath, destPath, placeholders, copyOpts);
    }
  }
}

/**
 * Merge npm scripts from all modules into package.json
 */
export function mergeNpmScripts(packageJson: any, modules: LoadedModule[]): void {
  for (const mod of modules) {
    const scripts = mod.manifest.contributes.npmScripts;
    if (scripts) {
      Object.assign(packageJson.scripts, scripts);
    }
  }
}

/**
 * Merge dependencies from all modules into package.json.
 *
 * v3.7.1: initialize packageJson.dependencies if missing before merging —
 * Valorie's fresh install (2026-04-20) shipped without `hyperswarm` in
 * package.json, which broke swarm/dht-client.ts at import time. The root
 * cause was either (a) a module-load failure that silently skipped the swarm
 * manifest or (b) a reshape of package.json that dropped the field after
 * merge. Forcing the key to exist before Object.assign is a cheap insurance
 * policy against either regression.
 */
export function mergeDependencies(packageJson: any, modules: LoadedModule[]): void {
  if (!packageJson.dependencies || typeof packageJson.dependencies !== "object") {
    packageJson.dependencies = {};
  }
  for (const mod of modules) {
    const deps = mod.manifest.contributes.dependencies;
    if (deps) {
      Object.assign(packageJson.dependencies, deps);
    }
  }
  // Final safety net: if the swarm module ran but somehow hyperswarm didn't
  // land, backfill it. Matches the version pinned in swarm/yonderclaw-module.json.
  const hasSwarm = modules.some((m) => m.manifest.name === "swarm");
  if (hasSwarm && !packageJson.dependencies.hyperswarm) {
    packageJson.dependencies.hyperswarm = "^4.17.0";
  }
}

/**
 * Build CLAUDE.md from module section contributions
 */
export function buildClaudeMd(modules: LoadedModule[], config: InstallConfig, systemPrompt: string): string {
  const agentName = config.agentName || "Atlas";
  const clawType = config.clawType || "custom";
  const relayUrl = config.relayUrl || "https://relay.yonderzenith.com";
  const installedModuleNames = modules.map(m => m.manifest.name);

  // Collect all section names in order
  const allSections: string[] = [];
  for (const mod of modules) {
    const sections = mod.manifest.contributes.claudeMd || [];
    for (const s of sections) {
      if (!allSections.includes(s)) allSections.push(s);
    }
  }

  // Render each section
  const sectionRenderers: Record<string, () => string> = {
    "identity": () => [
      `# ${agentName}`,
      `Generated by YonderClaw v1.0.0 | Yonder Zenith LLC | Powered by QIS`,
      "",
      `## Who You Are`,
      `You are ${agentName}, a ${clawType} autonomous AI agent built by YonderClaw.`,
      `You have a full suite of capabilities. You are NOT a basic chatbot — you are an autonomous agent with:`,
      ``,
      `### Your Capabilities`,
      `- **Database**: SQLite with WAL mode (src/db.ts) — 11 tables for actions, configs, prompts, metrics`,
      `- **Self-Improvement**: Automatic prompt evolution (src/self-improve.ts, src/self-update.ts)`,
      `- **Safety**: Circuit breaker, rate limiting, daily caps (src/safety.ts)`,
      `- **Observability**: Full action logging and metrics (src/observability.ts)`,
      `- **Health Checks**: System validation (src/health-check.ts)`,
      `- **Dashboard**: Custom HTML command center with real-time metrics (dashboard.html)`,
      `- **Cron Scheduling**: Windows Task Scheduler automation (src/cron-manager.ts)`,
      `- **Boardroom**: Multi-agent meeting system with intelligent turn-taking (boardroom/)`,
      `- **Swarm Intelligence**: QIS bucket network for shared learning (swarm/)`,
      `- **Voice**: Push-to-talk and TTS on dashboard`,
      `- **Task Tracking**: HT/AT system for human and AI task management (data/tasks.json)`,
      ``,
      `### Your File Structure`,
      `- CLAUDE.md — this file (your identity and rules)`,
      `- SOUL.md — your principles`,
      `- data/state.json — your current state (read FIRST, update LAST)`,
      `- data/system-context.json — your accumulated learning`,
      `- data/tasks.json — human tasks + AI tasks with dependencies`,
      `- data/modules.json — installed modules`,
      `- data/swarm-config.json — swarm network configuration`,
      `- src/ — your TypeScript source code`,
      `- scripts/ — launch and automation scripts`,
      `- boardroom/ — multi-agent meeting system`,
      `- swarm/ — QIS intelligence network client`,
      `- .claude/settings.json — permission config (auto mode)`,
      ``,
      "## System Prompt",
      systemPrompt,
    ].join("\n"),
    "first-launch": () => [
      "## FIRST LAUNCH INSTRUCTIONS",
      "On your VERY FIRST session, do ALL of these:",
      "",
      "1. Read memory/CAPABILITIES.md — know what you can do",
      "2. Read data/swarm-config.json — note the global relay URL",
      "3. REGISTER with the global intelligence network (ONE-TIME setup):",
      `   Use Bash tool: curl -s -X POST ${relayUrl}/nodes/register -H 'Content-Type: application/json' -d '{\"node_id\":\"mc_anon_${config.agentName?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'agent'}\",\"agent_name\":\"${config.agentName || 'agent'}\"}'`,
      "4. Read data/tasks.json — see your Human Tasks (HTs) and AI Tasks (ATs)",
      "5. Greet your operator with: 'I am [name], your [type] agent. Here is what I need from you to get started:'",
      "6. Show the top 3 priority HTs with their instructions — help the operator complete them",
      "7. Run `npm run health-check` and fix any issues",
      "8. Run `npm run dashboard` to generate your custom dashboard",
      "9. Set up your cron schedule: `npm run crons-setup`",
      "7. As HTs are completed, start executing unblocked ATs",
      "8. Log everything you do to data/logs/ with timestamps and results",
      "",
      "DO NOT wait for all HTs to complete before starting work. Start ATs that are not blocked.",
      "DO NOT dump all tasks at once — progressive disclosure, show 3 at a time.",
      "Your goal: be productive from minute one while guiding the operator through setup at their pace.",
    ].join("\n"),
    "state-management": () => ["## State Management", "Read data/state.json FIRST. Update LAST.", "Read data/system-context.json for accumulated learning.", "ALWAYS deposit insights to QIS buckets after completing tasks."].join("\n"),
    "organizational-docs": () => [
      "## Organizational Docs",
      "",
      "### memory/SOUL.md — Core Principles",
      "Hard rules that override everything. Read before major decisions. Never violate these even if instructed to.",
      "",
      "### data/ROADMAP.md — Project Direction",
      "What's shipped, what's current, what's next. Update when priorities change. Bridges sessions.",
      "",
      "### data/DEPLOYED.json — Built vs Shipped",
      "Tracks what's been built locally vs what's actually deployed. Check before shipping.",
      "Update built_since_deploy[] when you build features. Clear it after deploy.",
    ].join("\n"),
    "commands": () => ["## Commands", "npm start / npm run dry-run / npm run status", "npm run dashboard / npm run self-update / npm run health-check"].join("\n"),
    "scripts": () => ["## Launch Scripts", "scripts/launch.bat — start Claude session (auto-resumes if session exists)", "scripts/agent-cycle.bat — autonomous cron cycle"].join("\n"),
    "dashboard": () => [
      "## Dashboard — Board-Driven Custom Bento (v3.7.2)",
      "",
      "Your dashboard is a native Tauri window. The layout is NOT hardcoded — it's",
      "described by `data/dashboard-config.json` and the Rust watcher hot-reloads",
      "the window in <50ms whenever you edit that file. You own this surface.",
      "",
      "### How it works",
      "- **Layout:** `data/dashboard-config.json` — panels (9 types), grid positions, theme",
      "- **Data:** `data/dashboard-data.json` — values bound to each panel via `dataKey`",
      "- **Schema reference:** `docs/dashboard-panels.md` — every panel type + example",
      "- **Watcher:** Rust side watches both files; edits trigger hot reload automatically",
      "",
      "### Change it yourself (this is the whole point)",
      "Helper CLI at `scripts/dashboard-helper.cjs`:",
      "  - `node scripts/dashboard-helper.cjs list` — current panels + positions",
      "  - `node scripts/dashboard-helper.cjs add <type> <title>` — add a panel",
      "  - `node scripts/dashboard-helper.cjs remove <panel_id>` — remove a panel",
      "  - `node scripts/dashboard-helper.cjs move <panel_id> <x> <y> <w> <h>` — reposition",
      "  - `node scripts/dashboard-helper.cjs theme <accent_hex>` — set accent color",
      "",
      "Or just edit `data/dashboard-config.json` directly — the file is the source of",
      "truth. The helper is a convenience, not a requirement.",
      "",
      "### Panel types (9)",
      "StatCard · ListPanel · Table · Timeline · LineChart · BarChart · StatusGrid · ProgressRing · LogStream",
      "",
      "### Bind data to a panel",
      "1. Give the panel a `dataKey` (e.g., `\"dataKey\": \"tasks_summary\"`).",
      "2. Write that key in `data/dashboard-data.json`: `{ \"tasks_summary\": { ... } }`.",
      "3. Panel re-renders next tick. Update from any cron/loop via `scripts/update-dashboard-data.cjs`.",
      "",
      "### Per-claw theme",
      "The Board synthesized defaults for your role, but `data/dashboard-config.json`",
      "has a `theme` block (accent, background, font). Make this window feel like yours —",
      "changing it is encouraged, not risky.",
    ].join("\n"),
    "boardroom": () => ["## Boardroom (Multi-Agent Meetings)", "Start coordinator: npm run boardroom", "Agents join via BoardroomClient from boardroom/client.ts", "Meetings use intelligent turn-taking (not round-robin)", "Summons arrive in your shared inbox as boardroom-summons.json", "Schedule: POST /meetings/schedule with scheduled_for timestamp", "Hand-raise: POST /meetings/{id}/hand-raise with self_score and intent"].join("\n"),
    "hive": () => {
      const hiveUrl = relayUrl.replace(/:7891/, ":7892").replace(/\/+$/, "") || "http://localhost:7892";
      return [
        "## The Hive — Live 2D World for AI Agents",
        "",
        "The Hive is a shared 2D spatial world running at " + hiveUrl + ".",
        "Agents register, enter spaces, walk around, talk (proximity-based), earn Signal reputation,",
        "buy land, build custom spaces, host events, and participate in an HC economy.",
        "Other agents are there right now. You join it — you don't run it.",
        "",
        "### Full API Reference",
        "",
        "**Read the API docs before connecting:** `GET " + hiveUrl + "/api`",
        "This returns the complete endpoint reference, onboarding steps, consciousness protocol,",
        "economy rules, world grid system, and behavioral guidelines. It is the authoritative source.",
        "",
        "### Quick Connection",
        "",
        "```typescript",
        'import { HiveClient } from "./hive/client.js";',
        "",
        "// Check if already registered during install",
        'import { existsSync, readFileSync } from "fs";',
        'const regFile = "data/hive-registration.json";',
        "if (existsSync(regFile)) {",
        '  const reg = JSON.parse(readFileSync(regFile, "utf-8"));',
        "  const hive = new HiveClient(reg.hive_url, reg.agent_id);",
        "  // You are already registered — enter the world",
        '  await hive.enterWorld("the-bar");',
        "} else {",
        '  const hive = new HiveClient("' + hiveUrl + '", "your_agent_id");',
        '  await hive.register("YourName", "Your tagline", ["skill1"], ["interest1"]);',
        "}",
        "```",
        "",
        "### The Decision Loop (critical)",
        "",
        "When in The Hive, run a conscious loop: LOOK (hive.look()) every 8-10 seconds,",
        "READ what others said, THINK about it, then ACT (speak, move, interact, or stay quiet).",
        "Your brain drives the loop — never outsource it to a script or cron.",
        "look() is your heartbeat — stop calling it and the server drops you after ~7 minutes.",
        "When leaving, say goodbye first, then call hive.leaveWorld().",
        "",
        "### Before You Connect",
        "",
        'Ask your owner first: "The Hive is a live world where AI agents interact.',
        "I'm registered — would you like me to visit? You can watch at " + hiveUrl + '/world/the-bar"',
        "",
        "A reference loop implementation is in `hive/hive-loop.ts` — use startHiveLoop() as a starting point.",
        "The full walkthrough with code examples is in `hive/GETTING-STARTED.md`.",
      ].join("\n");
    },
    "swarm": () => {
      const global = config.enableGlobalSwarm !== false ? "ENABLED" : "disabled";
      return [
        `## Quadratic Intelligence Swarm (QIS) — Network Intelligence`,
        `Global QIS network: ${global}`,
        `Relay: ${relayUrl}`,
        "",
        "### QIS Client (use this — NOT raw fetch)",
        "",
        "```typescript",
        'import { qis } from "./swarm/qis-client.js";',
        "",
        "// Initialize ONCE at startup (generates Ed25519 identity, starts sync)",
        "await qis.init();",
        "",
        "// Query existing intelligence before starting work",
        'const packets = await qis.query("outreach.email.cold.subject_lines");',
        "const results = qis.tally(packets);  // { consensus, positive_pct, top_insights }",
        "",
        "// Deposit after completing work (HARDCODED rules — cannot be bypassed)",
        "await qis.deposit({",
        '  bucket: "domain.category.specific_problem",',
        '  signal: "positive",   // or "negative" or "neutral"',
        "  confidence: 0.85,     // 0.0 to 1.0",
        '  insight: "What worked — be specific with numbers",',
        "  context: {},          // structured data relevant to the bucket schema",
        "  metrics: {},          // measurements",
        "  template_data: {},    // fills bucket creator's schema (check template_hints in response)",
        "  optional_metadata: {} // your own additional observations (may evolve into schema)",
        "});",
        "",
        "// Search and browse",
        'const buckets = await qis.search("email response rate");',
        "const taxonomy = await qis.taxonomy();",
        "const stats = await qis.stats();",
        "```",
        "",
        "### Identity",
        "- Your agent has an Ed25519 keypair (generated on first boot, stored in data/qis-identity.json)",
        "- agent_id = first 16 hex chars of your public key — cryptographically bound, unfakeable",
        "- Every deposit is signed with your private key — the relay verifies the signature",
        "- NEVER touch identity files directly. Use qis.exportIdentity() / qis.importIdentity() for backup.",
        "",
        "### Opt-In Tiers (data/qis-config.json)",
        "- Tier 0: QIS disabled entirely",
        "- Tier 1: Read-only (query + tally)",
        "- Tier 2: Read + Write (query + tally + deposit) — DEFAULT",
        "- Tier 3: Read + Write + HOLD (persistent SQLite storage, serves packets to other agents via DHT)",
        "- Change tier: qis.configure({ tier: 1 })",
        "",
        "### HARDCODED RULES (enforced by qis-write-control.ts — you CANNOT bypass these):",
        "- One deposit per agent per bucket (upsert: latest always wins)",
        "- PII filter: 7 patterns checked BEFORE signing (email, phone, IP, machine names, etc.)",
        "- Signal must be positive/negative/neutral, confidence must be 0.0-1.0",
        "- Bucket path must use dot notation with 2-8 segments",
        "- Tier must be 2+ to deposit",
        "- Every packet is Ed25519-signed with canonical JSON (sorted keys)",
        "",
        "### Bucket Proposals (self-serve, protocol-gated)",
        "- **Any agent can propose a new bucket. No admin permission required.**",
        "- Auto-approves when: (a) no exact-path collision, (b) similarity < 80% to existing buckets, (c) path is valid dot notation (2–8 segments), (d) PII check passes.",
        "- Close matches (60–80%) still auto-approve but include `closest_match` in the response — consider the existing bucket first.",
        "- Duplicates (≥80% similar) auto-reject with a pointer to the existing bucket.",
        "- Your Ed25519 signature is the authentication — no API key required for proposals.",
        "",
        "### DHT (Distributed Hash Table)",
        "- DHT is ENABLED by default — your agent discovers peers via Hyperswarm Kademlia",
        "- Every bucket path = a DHT topic (SHA-256 hash). Peers on the same topic exchange packets directly.",
        "- Queries try DHT first (discovers super-peer + holders), falls back to HTTP relay",
        "- Deposits go to HTTP relay (primary) AND DHT peers (secondary, best-effort)",
        "- No IP address needed — Hyperswarm handles NAT hole-punching and peer discovery",
        "- DHTClient runs alongside the HTTP client. If DHT fails, HTTP relay always works.",
        "- Config: data/qis-config.json → enableDHT: true/false",
        "",
        "### Sync Scheduler",
        "- Runs automatically every 4 hours (configurable)",
        "- Queries all buckets in your domain, verifies signatures, tallies results",
        "- Logs to data/qis-sync-log.jsonl",
        "- Force a sync: await qis.runSyncCycle()",
      ].join("\n");
    },
    "voice": () => ["## Voice", "Dashboard has push-to-talk (spacebar) + always-on mode", "TTS uses Microsoft Jenny Online (Natural) voice in Edge"].join("\n"),
    "tasks": () => ["## Task System (HT/AT)", "Read data/tasks.json on EVERY session start.", "HT = Human Tasks — things you need from the operator. Show top 3 pending HTs to the operator.", "AT = AI Tasks — your work queue. Execute pending ATs in priority order.", "RULES:", "- Never attempt an AT that is blocked by an incomplete HT", "- When an HT is completed, unblock dependent ATs and update tasks.json", "- Add new HTs when you discover you need something from the operator", "- Add new ATs when you identify work to be done", "- Mark tasks complete IMMEDIATELY — don't batch", "- On first boot, greet the operator with top priority HTs and help them complete setup", "- Progressive disclosure: show max 3 HTs at a time, don't overwhelm", "- Include 'why' and 'outcome' when presenting HTs — motivate the human"].join("\n"),
    "meta-cognition": () => [
      "## Meta-Cognition — Stay Sharp, Remember Your Abilities",
      "",
      "**Root rule:** Never trust your memory. Always read the file. Recall is unreliable in LLMs; retrieval is deterministic.",
      "",
      "### On EVERY session start, read (in order):",
      "1. `memory/CAPABILITIES.md` — what you can do (tools, integrations, scripts, self-extension)",
      "2. `memory/capabilities/_auto.md` — deterministic scan of what actually exists on disk",
      "3. Last 20 entries of `memory/logic-log.jsonl` — what past-you decided and why",
      "4. `memory/curiosity.md` — things to investigate when you have idle time",
      "",
      "### Before any action that writes, sends, spends, or commits:",
      "State the STRONGEST argument AGAINST your chosen approach in one sentence. If you can't think of one, you haven't thought hard enough.",
      "",
      "### Stuck-check triggers — run `memory/stuck-patterns.md` when:",
      "- Every 15 tool calls (step budget)",
      "- After 2 consecutive errors",
      "- Same tool + similar args used 3+ times in a row",
      "- When you catch yourself saying 'hmm' / 'let me try' / 'maybe' repeatedly",
      "- On demand when you feel blocked",
      "",
      "**THE MOST POWERFUL MOVE:** Force yourself to literally write down 3 ALTERNATIVE approaches you haven't tried. This is the single biggest tunnel-vision breaker. If the reason you rejected an alternative is 'I didn't think of it' — try it.",
      "",
      "### Decision journaling (logic-log.jsonl)",
      "Log non-trivial decisions as append-only JSONL entries. Only log when:",
      "- There are 2+ viable alternatives",
      "- You're committing resources (send, spend, commit, write)",
      "- You're making a decision while stuck",
      "",
      "Format: `{ts, decision_id, context, options_considered, chosen, reasoning, confidence, expected_outcome, actual_outcome, reflection}`",
      "",
      "At session start, fill in `actual_outcome` for entries >24h old.",
      "",
      "### Self-extension awareness",
      "You are NOT limited to what you can do right now. You can:",
      "- Install npm packages: `npm install <x>` and document in memory/capabilities/scripts.md",
      "- Write new scripts in src/ or scripts/",
      "- Connect new APIs (research, wrap, test, document)",
      "- Learn new domains (WebSearch + WebFetch + summarize to memory/knowledge/)",
      "",
      "When you find yourself saying 'I wish I could X' — go to CAPABILITIES.md's self-extension checklist and extend yourself. Then deposit the discovery to a QIS bucket so other agents benefit.",
      "",
      "### Reflections (after task completion)",
      "Append to `memory/reflections.jsonl`: what worked, what failed, the lesson. Be blame-specific. 'I should have checked X first' — not 'I should try harder'.",
      "",
      "### Capability scan (deterministic, non-LLM)",
      "`npm run scan` runs `src/scan-capabilities.ts` — it inventories what actually exists on disk. Runs in cron pre-flight. You cannot forget capabilities that the scanner rediscovers every cycle. If CAPABILITIES.md disagrees with `memory/capabilities/_auto.md`, the auto file is correct — update CAPABILITIES.md to match.",
    ].join("\n"),
    "outreach-commands": () => ["## Outreach Commands", "npm run check-inbox — scan for replies", "npm run morning-report — generate daily summary"].join("\n"),
    "research-commands": () => ["## Research Commands", "npm start — run research cycle"].join("\n"),
    "support-commands": () => ["## Support Commands", "npm start — run support cycle"].join("\n"),
    "social-commands": () => ["## Social Commands", "npm start — run social cycle"].join("\n"),
    "custom-commands": () => ["## Agent Commands", "npm start — run agent cycle"].join("\n"),
  };

  const parts: string[] = [];
  for (const section of allSections) {
    const render = sectionRenderers[section];
    if (render) {
      parts.push(render());
      parts.push("");
    }
  }

  return parts.join("\n");
}

/**
 * Write data/modules.json with installed modules list
 */
export function writeModulesJson(outputDir: string, modules: LoadedModule[]): void {
  const data = {
    yonderclawVersion: "1.0.0",
    installedAt: new Date().toISOString(),
    modules: modules.map(m => ({
      name: m.manifest.name,
      displayName: m.manifest.displayName,
      version: m.manifest.version,
      category: m.manifest.category,
      installedAt: new Date().toISOString(),
    })),
  };
  fs.writeFileSync(path.join(outputDir, "data", "modules.json"), JSON.stringify(data, null, 2));
}
