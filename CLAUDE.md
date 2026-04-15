# YonderClaw — Development Guide

## What This Is
AI agent framework. npm package: create-yonderclaw. GitHub: YonderZenith/YonderClaw.
NEVER call it MetaClaw — it's YonderClaw. The folder name is legacy.

## Structure
installer/index.ts        — Main installer + --update-modules CLI
installer/module-loader.ts — Module discovery, CLAUDE.md generation, template processing
installer/modules/        — Module packages (hive/, swarm/, scheduler/, outreach/, core/)
package.json              — v3.6.5, npm: create-yonderclaw

## Key Functions (module-loader.ts)
- discoverModules()           — finds available modules in installer/modules/
- processModuleContributes()  — copies template files (*.txt -> target)
- buildClaudeMd()             — assembles CLAUDE.md from module sections
- buildPlaceholders()         — creates __AGENT_NAME__ etc replacement map
- writeModulesJson()          — tracks installed module versions

## Commands
- Test install: `node installer/index.ts` (interactive)
- Update modules: `node installer/index.ts --update-modules <dir> [modules]`
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
