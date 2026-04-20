# YonderClaw — Development Guide

## What This Is
AI agent framework. npm package: create-yonderclaw. GitHub: YonderZenith/YonderClaw.
NEVER call it MetaClaw — it's YonderClaw. The folder name is legacy.

## Structure
installer/index.ts        — Main installer + --update-modules CLI
installer/module-loader.ts — Module discovery, CLAUDE.md generation, template processing
installer/modules/        — Module packages (hive/, swarm/, scheduler/, outreach/, core/)
desktop/                  — Tauri 2 + React UI bundled with every install (v3.7.0+)
package.json              — v3.7.0, npm: create-yonderclaw

## Workspace
This is `YonderClaw-v3.7.0/`. The legacy `MetaClaw-v3.3/` workspace is the rollback anchor — DO NOT edit it; all new work happens here.

## Key Functions (module-loader.ts)
- discoverModules()           — finds available modules in installer/modules/
- processModuleContributes()  — copies template files (*.txt -> target)
- buildClaudeMd()             — assembles CLAUDE.md from module sections
- buildPlaceholders()         — creates __AGENT_NAME__ etc replacement map
- writeModulesJson()          — tracks installed module versions

## Commands
- Test install: `node installer/index.ts` (interactive)
- Update modules: `node installer/index.ts --update-modules <dir> [modules]`
- Build desktop binary: `cd desktop && npm run tauri:build` — **NEVER run bare `cargo build --release`**: it skips the `beforeBuildCommand` (`npm run build`) so the embedded dist is stale and the webview loads an old/blank bundle. Use `tauri:build -- --no-bundle` to skip the platform installer.
- Publish: `npm publish` (Axiom handles this)
- Push: `git push origin main`

## Module Structure
Each module in installer/modules/<name>/ has:
- yonderclaw-module.json — manifest (contributes, dependencies, scripts)
- Template files (*.txt) — copied to agent project, placeholders replaced

## Rules
- QIS is "Quadratic Intelligence Swarm" — never Scaling/Synthesis
- Describe WHAT QIS does, not HOW (no patent details in public code)
- Never modify deployed version — work in new version copy
- Track changes in project_hive_unpushed_changes.md (GitHub/npm section)
