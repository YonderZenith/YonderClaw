#!/usr/bin/env node
/**
 * MetaClaw Installer v3.3.0
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

  // Phase 2.5: Claude Authentication (MANDATORY)
  const claudePath = findClaudePath(systemInfo);

  if (!systemInfo.claude.installed) {
    console.log(sectionHeader("Installing Claude Code"));
    console.log("");
    try {
      execSync('powershell -Command "irm https://claude.ai/install.ps1 | iex"', { stdio: "inherit", timeout: 120000 });
    } catch {
      console.log(accent("  Install Claude Code manually: https://claude.ai/download"));
      console.log(accent("  Then run setup.bat again."));
      process.exit(1);
    }
    const recheck = detectSystem();
    if (!recheck.claude.installed) {
      console.log(accent("  Close this window, open a NEW terminal, run setup.bat again."));
      process.exit(1);
    }
    systemInfo.claude = recheck.claude;
  }

  if (!systemInfo.claude.authenticated) {
    console.log(sectionHeader("Claude Authentication Required"));
    console.log("");
    console.log(brand("  MetaClaw requires Claude to power your agent."));
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
        console.log(accent("  Then run setup.bat again."));
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
  console.log(status.route("Assembling the MetaClaw board for your " + result.template.name + "..."));
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
          path.join(startupDir, `MetaClaw-${sessionName}.bat`),
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
  console.log(completionScreen(agentName as string, projectDir, result.template.icon + " " + result.template.name));

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

main().catch((err) => {
  console.error(accent(`\n  Error: ${err.message}\n`));
  process.exit(1);
});
