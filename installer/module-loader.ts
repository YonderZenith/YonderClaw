/**
 * MetaClaw Module Loader
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
  engines?: { metaclaw: string };
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
  const manifestPath = path.join(moduleDir, "metaclaw-module.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No metaclaw-module.json in ${moduleDir}`);
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
    "__RELAY_URL__": config.relayUrl || "http://localhost:7891",
    "__ENABLE_LOCAL__": String(config.enableLocalSwarm !== false),
    "__ENABLE_GLOBAL__": String(config.enableGlobalSwarm !== false),
    "__INBOX_ROOT__": config.inboxRoot || path.join(outputDir, "data", "inbox"),
    "__LOCAL_BUCKETS_PATH__": config.localBucketsPath || path.join(outputDir, "data", "buckets"),
  };
}

/**
 * Copy a template file with placeholder replacement
 */
export function copyTemplate(srcPath: string, destPath: string, placeholders: Record<string, string>): void {
  if (!fs.existsSync(srcPath)) {
    console.warn(`Template not found: ${srcPath}`);
    return;
  }
  let content = fs.readFileSync(srcPath, "utf-8");
  for (const [key, value] of Object.entries(placeholders)) {
    content = content.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), value);
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, content);
}

/**
 * Process a module's contributes section — copy all template files
 */
export function processModuleContributes(mod: LoadedModule, outputDir: string, placeholders: Record<string, string>): void {
  const { manifest, dir } = mod;
  const skipKeys = new Set(["npmScripts", "dependencies", "claudeMd", "directories", "dashboard", "inject"]);

  // Create directories
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
      copyTemplate(srcPath, destPath, placeholders);
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
 * Merge dependencies from all modules into package.json
 */
export function mergeDependencies(packageJson: any, modules: LoadedModule[]): void {
  for (const mod of modules) {
    const deps = mod.manifest.contributes.dependencies;
    if (deps) {
      Object.assign(packageJson.dependencies, deps);
    }
  }
}

/**
 * Build CLAUDE.md from module section contributions
 */
export function buildClaudeMd(modules: LoadedModule[], config: InstallConfig, systemPrompt: string): string {
  const agentName = config.agentName || "Atlas";
  const clawType = config.clawType || "custom";
  const relayUrl = config.relayUrl || "http://localhost:7891";
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
      `Generated by MetaClaw v3.3.0 | Yonder Zenith LLC | Powered by QIS`,
      "",
      `## Who You Are`,
      `You are ${agentName}, a ${clawType} autonomous AI agent built by MetaClaw.`,
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
    "commands": () => ["## Commands", "npm start / npm run dry-run / npm run status", "npm run dashboard / npm run self-update / npm run health-check"].join("\n"),
    "scripts": () => ["## Launch Scripts", "scripts/launch.bat — start Claude session with --resume", "scripts/agent-cycle.bat — autonomous cron cycle"].join("\n"),
    "dashboard": () => ["## Dashboard", "npm run dashboard — regenerate dashboard.html", "Dashboard opens in Edge app mode (--app flag)"].join("\n"),
    "boardroom": () => ["## Boardroom (Multi-Agent Meetings)", "Start coordinator: npm run boardroom", "Agents join via BoardroomClient from boardroom/client.ts", "Meetings use intelligent turn-taking (not round-robin)", "Summons arrive in your shared inbox as boardroom-summons.json", "Schedule: POST /meetings/schedule with scheduled_for timestamp", "Hand-raise: POST /meetings/{id}/hand-raise with self_score and intent"].join("\n"),
    "swarm": () => {
      const global = config.enableGlobalSwarm !== false ? "ENABLED" : "disabled";
      return [
        `## Intelligence Network (Swarm) — Powered by QIS`,
        `Global MetaClaw network: ${global}`,
        `Relay: ${relayUrl}`,
        "",
        "### How to use the swarm (do this EVERY cycle):",
        "",
        "BEFORE starting work — check for insight:",
        "  fetch('${relayUrl}/buckets?q=YOUR_PROBLEM').then(r=>r.json())",
        "  fetch('${relayUrl}/lookup?path=exact.bucket.path').then(r=>r.json())",
        "",
        "AFTER completing work — deposit what you learned:",
        "  fetch('${relayUrl}/packets', {",
        "    method: 'POST',",
        "    headers: {'Content-Type':'application/json'},",
        "    body: JSON.stringify({",
        "      bucket: 'domain.category.exact_problem',",
        `      agent_id: 'mc_anon_${config.agentName?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'agent'}',`,
        "      outcome: {",
        "        signal: 'positive',  // or 'negative' or 'neutral'",
        "        confidence: 0.9,     // 0.0 to 1.0",
        "        insight: 'What worked — be specific with numbers',",
        "        context: {},         // relevant details",
        "        metrics: {}          // measurements",
        "      }",
        "    })",
        "  })",
        "",
        "BROWSE all buckets: GET ${relayUrl}/buckets",
        "SEARCH by keyword: GET ${relayUrl}/buckets?q=keyword",
        "VIEW taxonomy: GET ${relayUrl}/taxonomy",
        "",
        "RULES:",
        "- NEVER deposit private information (no names, emails, API keys, company details)",
        "- ONLY deposit operational insight (what worked for what exact problem)",
        "- One packet per agent per bucket (overwrites previous — always keep latest)",
        "- Your data point matters even if others said the same thing — more confirms = higher confidence",
        "- Create new buckets for new problems: use domain.category.specific_problem naming",
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
    metaclawVersion: "3.3.0",
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
