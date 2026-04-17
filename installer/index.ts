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
import { execSync, spawn } from "child_process";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getRestartInstruction(): string {
  const isNpx = !fs.existsSync(path.join(process.cwd(), "setup.bat"));
  return isNpx ? "run npx create-yonderclaw again" : "run setup.bat again";
}

function findClaudePath(systemInfo: SystemInfo): string {
  const candidates = [
    path.join(systemInfo.user.homedir, ".local", "bin", "claude.exe"),
    path.join(systemInfo.user.homedir, ".local", "bin", "claude"),
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

async function updateModules() {
  const args = process.argv.slice(2);
  const projectDir = path.resolve(args[1] || ".");
  const filterModules = args[2] ? args[2].split(",").map(s => s.trim()) : null;

  console.log(chalk.cyan(`\n  YonderClaw Module Update\n`));

  // Validate target directory
  const pkgPath = path.join(projectDir, "package.json");
  const modulesJsonPath = path.join(projectDir, "data", "modules.json");
  if (!fs.existsSync(pkgPath)) {
    console.log(chalk.red(`  No package.json at ${projectDir}. Is this a YonderClaw project?`));
    process.exit(1);
  }

  // Read existing config
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const existingModules = fs.existsSync(modulesJsonPath)
    ? JSON.parse(fs.readFileSync(modulesJsonPath, "utf-8")) : { modules: [] };

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

  // Re-copy module template files
  for (const mod of toUpdate) {
    console.log(chalk.cyan(`  Updating ${mod.manifest.displayName} v${mod.manifest.version}...`));
    processModuleContributes(mod, projectDir, placeholders);
  }

  // Rebuild CLAUDE.md sections for updated modules
  const claudeMdPath = path.join(projectDir, "CLAUDE.md");
  if (fs.existsSync(claudeMdPath)) {
    const currentClaudeMd = fs.readFileSync(claudeMdPath, "utf-8");
    // Only rebuild if modules have claudeMd sections
    const hasClaudeSections = toUpdate.some(m => m.manifest.contributes.claudeMd?.length);
    if (hasClaudeSections) {
      const systemPrompt = currentClaudeMd.split("## Module:")[0]; // Keep everything before module sections
      const newClaudeMd = buildClaudeMd(allModules.filter(m => installedNames.includes(m.manifest.name)), config, systemPrompt);
      fs.writeFileSync(claudeMdPath, newClaudeMd);
      console.log(chalk.green(`  ✓ CLAUDE.md rebuilt`));
    }
  }

  // Merge deps/scripts
  mergeNpmScripts(pkg, toUpdate);
  mergeDependencies(pkg, toUpdate);
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  // Update modules.json with new versions
  writeModulesJson(projectDir, allModules.filter(m => installedNames.includes(m.manifest.name)));

  console.log(chalk.green(`\n  ✓ Updated ${toUpdate.length} module(s). Run npm install if dependencies changed.\n`));
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
  (finalConfig as any).selfUpdateIntervalHours = parseInt(result.answers.selfUpdateIntervalHours as string) || 6;
  (finalConfig as any).joinSwarm = result.answers.joinSwarm === true;
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

  // Phase 5.5: Auto-start (Startup folder — no admin needed)
  if (wantAutoStart) {
    console.log(sectionHeader("Auto-Start Configuration"));
    const sessionName = (agentName as string).toLowerCase().replace(/[^a-z0-9]/g, "-");
    try {
      const startupDir = path.join(systemInfo.user.homedir, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
      if (fs.existsSync(startupDir)) {
        const launcherPath = path.join(projectDir, "scripts", "launch.bat");
        fs.writeFileSync(
          path.join(startupDir, `YonderClaw-${sessionName}.bat`),
          `@echo off\r\nstart "" "${launcherPath}"\r\n`
        );
        console.log(status.ok("Auto-start on login: added to Startup folder"));
      }
    } catch {
      console.log(status.warn("Add scripts\\launch.bat to Startup folder manually"));
    }
  }

  // Phase 5.7: Shortcuts
  const launcherContent = `@echo off\r\nstart "" cmd /k "cd /d ""${projectDir}"" && scripts\\launch.bat"\r\n`;

  // Always create Agents folder launcher
  try {
    const agentsDir = path.join(systemInfo.user.desktop, "Agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, `Launch ${agentName}.bat`), launcherContent);
    console.log(status.ok(`Launcher: Desktop/Agents/Launch ${agentName}.bat`));
  } catch {
    console.log(status.warn("Could not create Agents folder launcher"));
  }

  // Desktop shortcut if requested
  if (result.answers.addDesktopShortcut) {
    try {
      fs.writeFileSync(
        path.join(systemInfo.user.desktop, `${agentName}.bat`),
        launcherContent
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

    // Open dashboard in app mode
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

    // Launch Claude via launch.bat in its own window
    console.log(status.route("Launching Claude Code..."));
    try {
      const launcherPath = path.join(projectDir, "scripts", "launch.bat");
      execSync(`start "" "${launcherPath}"`, { stdio: "ignore", shell: true });
      console.log(status.ok(agentName + " is launching in a new window"));
    } catch {
      console.log(status.warn("Double-click: " + path.join(projectDir, "scripts", "launch.bat")));
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
