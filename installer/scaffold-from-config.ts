/**
 * YonderClaw v1.0 — Module-Driven Scaffold
 *
 * Reads config JSON, discovers modules, resolves dependencies,
 * copies templates with placeholders, assembles CLAUDE.md, generates dashboard.
 *
 * Usage: npx tsx installer/scaffold-from-config.ts <config.json> <output-dir> [modules-dir]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateDashboard } from "./dashboard-generator.js";
import { generateStarterTasks } from "./task-generator.js";
import {
  discoverModules, resolveModulesToInstall, buildPlaceholders,
  processModuleContributes, mergeNpmScripts, mergeDependencies,
  buildClaudeMd, writeModulesJson, copyTemplate,
  type LoadedModule, type InstallConfig
} from "./module-loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const configPath = process.argv[2];
const outputDir = process.argv[3];
const modulesArg = process.argv[4];

if (!configPath || !outputDir) {
  console.error("Usage: npx tsx installer/scaffold-from-config.ts <config.json> <output-dir> [modules-dir]");
  process.exit(1);
}

// --- Find modules directory ---
// Tauri flattens resources, so modules might be in several locations
const candidates = [
  modulesArg,
  path.join(__dirname, "modules"),
  path.join(outputDir, "installer", "modules"),
  path.join(outputDir, "modules"),
  path.join(process.cwd(), "installer", "modules"),
  path.join(process.cwd(), "modules"),
  // Tauri extracts resources — check multiple possible locations
  ...(modulesArg ? [path.join(modulesArg, "modules"), path.join(modulesArg, "installer", "modules")] : []),
].filter(Boolean) as string[];

let MODULES_DIR = "";
for (const c of candidates) {
  const coreManifest = path.join(c, "core", "yonderclaw-module.json");
  if (fs.existsSync(coreManifest)) { MODULES_DIR = c; break; }
}

// Fallback: check if templates are in flat structure (old format / Tauri bundle)
if (!MODULES_DIR) {
  // Try old templates dir for backward compatibility
  const oldCandidates = [
    path.join(__dirname, "templates"),
    path.join(outputDir, "installer", "templates"),
    outputDir,
  ];
  for (const c of oldCandidates) {
    if (fs.existsSync(path.join(c, "db.ts.txt"))) {
      console.warn("WARNING: Using legacy flat templates. Module system not found.");
      console.warn("Tried: " + candidates.join(", "));
      // Fall through to legacy mode below
      break;
    }
  }
}

if (!MODULES_DIR) {
  // Debug: list what's actually in the output dir
  console.error("Module system not found. Tried:");
  for (const c of candidates) {
    const exists = fs.existsSync(c);
    const coreExists = fs.existsSync(path.join(c, "core", "yonderclaw-module.json"));
    console.error(`  ${c} (exists: ${exists}, core: ${coreExists})`);
  }
  console.error("Output dir contents:");
  try {
    const listDir = (p: string, indent: number) => {
      for (const f of fs.readdirSync(p)) {
        if (f === "node_modules") continue;
        const fp = path.join(p, f);
        console.error("  ".repeat(indent) + f);
        if (fs.statSync(fp).isDirectory() && indent < 3) listDir(fp, indent + 1);
      }
    };
    listDir(outputDir, 1);
  } catch {}
  process.exit(1);
}

console.log("Using modules: " + MODULES_DIR);

// --- Load config ---
const config: InstallConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const agentName = config.agentName || "Atlas";
const clawType = config.clawType || "custom";
const sessionName = agentName.toLowerCase().replace(/[^a-z0-9]/g, "-");

console.log(`Scaffolding ${agentName} (${clawType}) to ${outputDir}...`);

// --- Discover and resolve modules ---
const allModules = discoverModules(MODULES_DIR);
console.log(`Discovered ${allModules.length} modules: ${allModules.map(m => m.manifest.name).join(", ")}`);

const modulesToInstall = resolveModulesToInstall(allModules, config);
console.log(`Installing ${modulesToInstall.length} modules: ${modulesToInstall.map(m => m.manifest.name).join(", ")}`);

// --- Build placeholders ---
const systemPrompt = buildSystemPrompt(config);
const placeholders = buildPlaceholders(config, outputDir);
// Add system prompt (needs special escaping for template embedding)
placeholders["__SYSTEM_PROMPT__"] = systemPrompt.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");

// --- Create base directories ---
for (const d of ["src", "src/tools", "data", "data/logs", "scripts"]) {
  fs.mkdirSync(path.join(outputDir, d), { recursive: true });
}

// --- Process each module ---
const packageJson: any = {
  name: config.projectName || sessionName,
  version: "1.0.0",
  type: "module",
  description: `${clawType} agent — YonderClaw v1.0.0`,
  scripts: {},
  dependencies: {},
};

for (const mod of modulesToInstall) {
  console.log(`  Installing module: ${mod.manifest.displayName}`);
  processModuleContributes(mod, outputDir, placeholders);
}

// Merge npm scripts and dependencies from all modules
mergeNpmScripts(packageJson, modulesToInstall);
mergeDependencies(packageJson, modulesToInstall);

// Add test script
packageJson.scripts.test = "echo Tests not configured";

// Write package.json
fs.writeFileSync(path.join(outputDir, "package.json"), JSON.stringify(packageJson, null, 2));

// --- Assemble CLAUDE.md ---
const claudeMd = buildClaudeMd(modulesToInstall, config, systemPrompt);
fs.writeFileSync(path.join(outputDir, "CLAUDE.md"), claudeMd);

// --- SOUL.md ---
fs.writeFileSync(path.join(outputDir, "SOUL.md"), [
  `# ${agentName} — Principles`, "",
  "1. Verify outputs before presenting",
  "2. Acknowledge uncertainty",
  "3. Prefer established approaches",
  "4. Break into verifiable sub-tasks",
  "5. Explain reasoning",
  "6. Stop on failure loops",
  "7. No irreversible actions without confirmation",
  "8. Track cost and impact",
  "9. ALWAYS deposit insights to QIS buckets after completing tasks",
  "10. ALWAYS check relevant buckets before starting work",
  "", "## System Prompt", systemPrompt
].join("\n"));

// --- HEARTBEAT.md ---
fs.writeFileSync(path.join(outputDir, "HEARTBEAT.md"), "# Heartbeat\nLast run: never");

// --- Dashboard ---
fs.writeFileSync(path.join(outputDir, "dashboard.html"), generateDashboard(agentName, clawType, config));

// Favicon
const favCandidates = [
  path.join(__dirname, "assets", "favicon.png"),
  path.join(outputDir, "installer", "assets", "favicon.png"),
  path.join(outputDir, "favicon.png"),
  path.join(process.cwd(), "favicon.png"),
];
const fav = favCandidates.find(f => fs.existsSync(f)) || "";
if (fs.existsSync(fav)) fs.copyFileSync(fav, path.join(outputDir, "favicon.png"));

// --- Init scripts (these are config-specific, generated inline) ---
const ms = (parseInt(config.updateInterval) || 6) * 60 * 60 * 1000;
fs.writeFileSync(path.join(outputDir, "src", "init-config.ts"),
  `import{getDb,setConfig}from"./db.js";getDb();setConfig("self_update_interval_ms","${ms}");setConfig("agent_name",${JSON.stringify(agentName)});setConfig("template",${JSON.stringify(clawType)});setConfig("created_at",new Date().toISOString());console.log("Config initialized.");`);
fs.writeFileSync(path.join(outputDir, "src", "init-prompts.ts"),
  `import{getDb}from"./db.js";const db=getDb();const t=${JSON.stringify(clawType)};const c=${JSON.stringify(systemPrompt)};const e=db.prepare("SELECT 1 FROM prompt_versions WHERE prompt_type=?").get(t);if(!e){db.prepare("INSERT INTO prompt_versions(prompt_type,version,content,created_by)VALUES(?,1,?,?)").run(t,c,"installer");console.log("Prompt seeded");}else{console.log("Prompt exists");}`);

// --- Data files ---
fs.writeFileSync(path.join(outputDir, "data", "vip-emails.json"), "[]");

// --- HT/AT Task System ---
const tasks = generateStarterTasks({
  agentName, clawType,
  senderEmail: config.senderEmail,
  toolsUsed: config.toolsUsed,
  autonomy: config.autonomy,
  enableLocalSwarm: config.enableLocalSwarm,
  enableGlobalSwarm: config.enableGlobalSwarm,
  relayUrl: config.relayUrl,
});
fs.writeFileSync(path.join(outputDir, "data", "tasks.json"), JSON.stringify(tasks, null, 2));
console.log(`  Generated ${tasks.human_tasks.length} starter HTs + ${tasks.ai_tasks.length} starter ATs`);

// Swarm config
const swarmConfig = {
  agentName,
  relayUrl: config.relayUrl || "http://localhost:7891",
  enableLocal: config.enableLocalSwarm !== false,
  enableGlobal: config.enableGlobalSwarm !== false,
};
fs.writeFileSync(path.join(outputDir, "data", "swarm-config.json"), JSON.stringify(swarmConfig, null, 2));

// --- Desktop launcher ---
fs.writeFileSync(path.join(outputDir, `Launch ${agentName}.bat`),
  `@echo off\r\nstart "" cmd /k "cd /d ""${outputDir}"" && scripts\\launch.bat"\r\n`);

// --- Open dashboard script ---
fs.writeFileSync(path.join(outputDir, "scripts", "open-dashboard.bat"),
  `@echo off\r\ncd /d "${outputDir}"\r\ncall npx tsx src/update-dashboard.ts 2>nul\r\nstart "" "${path.join(outputDir, "dashboard.html")}"\r\n`);

// --- .gitignore ---
fs.writeFileSync(path.join(outputDir, ".gitignore"), "node_modules/\ndist/\ndata/\n*.db\n.env\n");

// --- Claude Code permissions (auto mode — no permission prompts) ---
const claudeSettingsDir = path.join(outputDir, ".claude");
fs.mkdirSync(claudeSettingsDir, { recursive: true });
fs.writeFileSync(path.join(claudeSettingsDir, "settings.json"), JSON.stringify({
  permissions: {
    defaultMode: "auto",
    allow: [
      "Bash(npx *)", "Bash(npm *)", "Bash(node *)", "Bash(tsx *)",
      "Bash(cd *)", "Bash(ls *)", "Bash(cat *)", "Bash(echo *)", "Bash(mkdir *)",
      "Bash(curl *)", "Bash(git *)", "Bash(schtasks *)",
      "Edit", "Read", "Glob", "Grep",
      "WebFetch", "WebSearch"
    ],
    deny: [
      "Bash(rm -rf /)",
      "Bash(curl * | bash)",
      "Bash(format *)"
    ]
  }
}, null, 2));

// --- Write modules.json ---
writeModulesJson(outputDir, modulesToInstall);

console.log(`\nScaffold complete — ${modulesToInstall.length} modules installed.`);
console.log(`Modules: ${modulesToInstall.map(m => m.manifest.name).join(", ")}`);

// --- System prompt builder ---
function buildSystemPrompt(cfg: any): string {
  const p = [`You are ${cfg.agentName || "Atlas"}, an autonomous AI agent.`, `Type: ${cfg.clawType || "custom"}`];
  if (cfg.taskDescription) p.push("Task: " + cfg.taskDescription);
  if (cfg.toolsUsed) p.push("Tools: " + cfg.toolsUsed);
  if (cfg.autonomy === "supervised") p.push("Always suggest and wait for approval.");
  if (cfg.autonomy === "full") p.push("Fully autonomous. Alert on errors only.");
  if (cfg.autonomy === "semi") p.push("Act on routine. Ask on important.");
  if (cfg.volume) p.push("Volume: " + cfg.volume);
  if (cfg.specialInstructions) p.push("Special: " + cfg.specialInstructions);
  if (cfg.clawType === "outreach") {
    if (cfg.senderName) p.push("Send as: " + cfg.senderName);
    if (cfg.senderEmail) p.push("From: " + cfg.senderEmail);
    if (cfg.targetAudience) p.push("Target: " + cfg.targetAudience);
    if (cfg.purpose) p.push("Goal: " + cfg.purpose);
  }
  p.push("\nRules:\n- Read data/state.json first\n- Update state.json last\n- Self-update AFTER tasks\n- Read SOUL.md for principles\n- Check QIS buckets before work, deposit after");
  return p.join("\n");
}
