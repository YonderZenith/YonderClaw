# YonderClaw Changelog

## v3.7.2 (Board-driven dashboard — 2026-04-22, local experiment)
### Goal: Board-synthesized per-agent dashboard actually reaches the Tauri UI
v3.7.1 shipped `installer/dashboard-generator.ts` + `research.ts::DashboardPanel[]` but the Tauri desktop's `DashboardPanel.tsx` ignored the Board output entirely — every install rendered the same fixed three-column layout. v3.7.2 closes that gap end-to-end: Board → `data/dashboard-config.json` → Rust file-watcher → Zustand slice → `LayoutFrame` → 9-type panel registry → visibly different UI per agent. YZ brand floor (logo + "YonderClaw by Yonder Zenith" wordmark on the TopBar) stays immutable; theme, colors, layout, panels are all agent-editable via `data/dashboard-config.json` or `scripts/dashboard-helper.cjs`.

### Added
- **`desktop/src/lib/dashboard-config.ts`** — schema module. `PanelType` union of 9 (`kpi-card`, `metric-series`, `activity-feed`, `stat-grid`, `network-viz`, `timeline`, `status-list`, `progress-bar`, `custom-text`), `PanelPosition` of 3 (`top`/`right`/`bottom`), full `DashboardTheme` + `DashboardBrand` + `DashboardConfig` types, `DEFAULT_DASHBOARD_CONFIG`, and the `readDataKey(data, "stats.actions_taken")` dot-path resolver that panels use to pluck live metrics out of `data/dashboard.json` without crashing on missing intermediates.
- **9-panel component library** in `desktop/src/components/panels/`: `KpiCard`, `MetricSeries` (SVG sparkline), `ActivityFeed`, `StatGrid`, `NetworkViz` (circular peer graph), `Timeline`, `StatusList`, `ProgressBar`, `CustomText`. Shared `PanelShell` for border-top accent + head/body layout. `PANEL_REGISTRY: Record<PanelType, ComponentType<PanelProps>>` in `index.ts` — LayoutFrame looks up by config `type` string.
- **`desktop/src/components/LayoutFrame.tsx`** — subscribes to both `dashboard-updated` (metrics) and `dashboard-config-updated` (layout+theme) via `onDashboardUpdate` / `onDashboardConfigUpdate`, applies theme colors as CSS custom properties on `document.documentElement` on every config change, groups panels by `position`, renders three bands (top strip, right column, bottom strip) around the embedded terminal. Missing band collapses cleanly via flex.
- **Rust watcher extension** (`desktop/src-tauri/src/watcher.rs`) — startup-emit + file-change-emit for `dashboard-config.json` alongside the existing `dashboard.json`. <50 ms reload via `ReadDirectoryChangesW`.
- **`installer/dashboard-config-writer.ts`** — install-time translator. Consumes the Board's `DashboardPanel[]` (types `kpi|table|feed|health|custom`, colors as CSS vars) and emits the v3.7.2 `DashboardConfig`. `TYPE_MAP`, `COLOR_MAP`, `THEME_BY_TEMPLATE` (outreach cyan / research purple / support green / social orange / custom gold). If Board produced no panels, falls back to `installer/templates/dashboard-defaults/<template>.json`. KPIs go top, other panels right, bottom reserved for agent additions.
- **Per-claw fallback defaults** (`installer/templates/dashboard-defaults/{outreach,research,support,social,custom}.json`) — 5 hand-tuned layouts the agent gets when the Commissioning Board is skipped or produced no panels. Each visibly reflects the claw's mission (outreach has email KPIs + deliverability checklist; research has cost + sources; support has SLA + queue; social has engagement + channels; custom has a "Make this yours" hint panel).
- **`installer/templates/dashboard-helper.cjs.txt`** — agent-editable CLI scaffolded into every install at `scripts/dashboard-helper.cjs`. Subcommands: `list`, `add --id --type --title --position [--dataKey --color --priority --description]`, `remove --id`, `set-theme --primary [--secondary --background --surface --text --muted --success --warn --error]`, `set-brand --agentName [--tagline]`, `preview`. Validates panel type + position, writes back with `meta.generatedBy = "hand-edit"` — UI hot-reloads in <50 ms.
- **`installer/templates/dashboard-panels.md.txt`** — full schema reference scaffolded to `docs/dashboard-panels.md`. Panel-type table (type → what it shows → expected `dataKey` shape → valid `config` keys), position semantics, priority ordering, `dataKey` dot-path rules, theme fields, CLI examples.

### Changed
- **`desktop/src/App.tsx`** — replaced the old `.split` two-pane layout with `<div className="app"><TopBar/><LayoutFrame><Terminal/></LayoutFrame></div>`. TopBar agent name prefers `dashboardConfig.brand.agentName` over the project folder name so Board-authored branding wins.
- **`desktop/src/store.ts`** — Zustand slice extended with `dashboardConfig: DashboardConfig` (initial `DEFAULT_DASHBOARD_CONFIG`), `dashboardConfigError: string | null`, and a `setDashboardConfig(cfg)` action. Kept prior `dashboard` metrics slice intact so Brian's v3.7.1 fixes aren't regressed.
- **`desktop/src/lib/tauri.ts`** — added `onDashboardConfigUpdate(cb)` listener symmetric to `onDashboardUpdate`.
- **`desktop/src/styles.css`** — added `.workspace`, `.workspace-main` (flex row, not grid — missing right band collapses), `.workspace-term`, `.panel-band-row` / `.panel-band-column`, `.panel`, and the nine per-type panel styles. Renamed `.status-dot` (new StatusList panel) → `.status-pip` to avoid class collision with TopBar's existing `.status-dot.ok/.stale/.off`. Legacy `.split`/`.dash`/`.card`/`.bootstrap` kept for now pending verified-dead sweep.
- **`installer/core-scaffold.ts`** — after writing `dashboard.html` (legacy, preserved for headless mode), now also calls `writeDashboardConfig(projectDir, config)` and scaffolds `scripts/dashboard-helper.cjs` + `docs/dashboard-panels.md` with `mkdirSync({recursive:true})` guards.

### Forward-compatibility note
- The legacy `dashboard.html` is still generated (headless build-dashboard.cjs still consumes it). v3.7.2's DashboardConfig and v3.7.1's dashboard.html coexist: the Tauri UI ignores the .html, the headless CLI ignores the .json. Dead-code pass deferred to v3.8.
- Per-agent AXIOM Body face as cross-product avatar (dashboard + Hive) — **roadmap**, not this release. Tracked in `project_axiom_body_face_avatar.md`.

### Version bumps
- `package.json` 3.7.1 → 3.7.2 (root + `optionalDependencies["@yonderclaw/desktop-win32-x64"]`).
- `desktop/package.json` 3.7.1 → 3.7.2.
- `desktop/src-tauri/Cargo.toml` + `tauri.conf.json` 3.7.1 → 3.7.2.
- `desktop-packages/win32-x64/package.json` 3.7.1 → 3.7.2 — binary rebuild required.

### Verification
- `npx tsc` spot-check on edited installer files and new desktop files — 0 errors (pre-existing strict-mode complaints unchanged).
- Rust compile started on `yonderclaw-desktop v3.7.2` — PE metadata to be verified post-link.
- E2E with outreach + research + support — pending Phase 8.

## v3.7.1 (installer cleanup — 2026-04-22)
### Goal: Fix the five bugs Brian caught post-v3.7.0 before Axiom publishes
v3.7.0 was pushed to GitHub 2026-04-20 (da91afe) but held for Axiom npm publish after Brian (QA agent) found five issues on a clean install. This point release rolls up all five fixes plus two polish items (time-injection adoption + heartbeat-refresh scope) so the first npm-published v3.7.x ships clean.

### Fixed
- **qis-autoconnect first-boot hang** (Brian bulletin #1). The template in `installer/core-scaffold.ts` spawned the DHT client, attempted a first-boot deposit, and relied on the DHT's own timer to exit. When the deposit threw (schema mismatch, relay unreachable, clock skew) the error surfaced but the DHT kept the Node event loop alive — the launcher spun indefinitely and never wrote `data/qis-deposit-log.json`, so every subsequent launch re-ran the same hanging autoconnect. Rewritten with a layered termination guarantee: outer try on init, inner try on deposit (does not rethrow), a `finally` that **always** writes the gate file with a result code (`ok | deposit_skipped | deposit_failed | init_failed | dormant`), an explicit `qis.shutdown()` + `process.exit(0)`, and a 25 s `setTimeout` watchdog (via `unref()`) that force-exits with `result: "watchdog_timeout"` if any of the above hangs. One run, one gate file, guaranteed exit. Launch.bat already checked the log-exists path, so repeat launches now skip autoconnect even on a failed first boot — the agent boots, no more hang.
- **Tauri desktop ignored `--dangerously-skip-permissions`** (Brian bulletin #3 — HIGH). The v3.7.0 desktop read `data/launch-config.json` written at install time; if the operator answered "no" to the skip-permissions question (default), every Claude spawn inside the desktop PTY prompted on every tool call and drowned the xterm pane. Flag is now always-on unless the operator opts *out* via env var: Tauri reads `VITE_YONDERCLAW_CLAUDE_PROMPTS` (set `=1` to restore prompts), `.bat` launchers read `YONDERCLAW_CLAUDE_PROMPTS`. `desktop/src/lib/launch.ts::skipPermsFlag()` no longer imports or calls `readSkipPermissions` — the Rust-side command is dormant, will be removed next major. Questionnaire dropped the skip-perms question (`answers.skipPermissions = true` hardcoded); autonomy-tier selection is the real gate.
- **Stale `D:\` path in Desktop shortcut** (Brian bulletin #4). Brian installed to `D:\YonderClaw-Agents\` during testing, then re-installed to `C:\Users\...\Desktop\Agents\`, and the Startup-folder shortcut still pointed at the D:\ path — launcher double-clicked into a ghost dir. Root cause: `buildLauncherBat` baked the absolute install-time project dir into the `.bat` body. Now `installer/index.ts` writes two launcher variants: a **project-folder copy** that uses `%~dp0` to self-resolve (portable — move the folder, launcher follows), and a **shortcut-site copy** (Startup / Desktop\Agents / Desktop) that keeps the absolute path (still double-clickable from outside the project dir). Both get written every install. Moving a project dir now Just Works for the in-folder launcher.
- **Dashboard launcher missing from project folder** (Brian bulletin #5). Before v3.7.1 only the shortcut-site copy of the dashboard launcher existed; operators opening the project folder directly saw only the legacy headless CLI `.bat`. Now each project folder ships two launchers: `Launch <Name> (dashboard).bat` (Tauri desktop, primary) and `Launch <Name> (headless CLI - no dashboard).bat` (CLI-only, fallback). Self-resolving paths via `%~dp0`, both honor `YONDERCLAW_CLAUDE_PROMPTS` opt-out.
- **`hyperswarm` missing after install on some machines** (Brian bulletin #2 — Valorie's install). Root cause unclear (possibly npm cache corruption or lockfile-driven skip), but `module-loader.ts::mergeDependencies` trusted `packageJson.dependencies` to already be an object and silently no-op'd when it wasn't. Hardened: defensively initializes `packageJson.dependencies` to `{}` if missing/non-object, merges module-declared deps, then a final safety net — if the swarm module is present and `hyperswarm` is still not in deps after the merge pass, backfills `hyperswarm: ^4.17.0` directly. Belt-and-suspenders; silent drop was the failure mode, now it cannot happen.

### Changed
- **Adopted Brian's time-injection bundle** (`scripts/time-injector.cjs` + `.claude/settings.local.json` `UserPromptSubmit` hook). Every prompt to Claude Code now gets a `<current-time>` block prepended with UTC / local (default `America/Phoenix`, override via `OPERATOR_TIMEZONE` env) / day-of-week / epoch-ms. Fixes the long-standing "agent thinks it's 2024" halucination on long-running sessions. Install-time merge is safe: if `.claude/settings.local.json` already exists, reads it, dedups on hook.command containing `time-injector.cjs`, and adds the hook without clobbering user hooks. Copied template from `Z:\shared\brian-to-ysmara\time-injection-bundle\scripts\time-injector.cjs`.
- **Heartbeat-refresh scope fix** (Brian logic-log L-018). `scripts/heartbeat-refresh.ts` runs every 5 min via cron and only wrote `heartbeat.current_focus`, leaving `heartbeat.current_task` and `heartbeat.status` pinned at first-launch values forever. Operators watching `data/heartbeat.json` saw a stale `current_task` no matter what the agent was actually doing. Cron now also carries `state.current_focus → heartbeat.current_task` and sets `heartbeat.status = "active"` on every tick, so the external view always matches what the agent last wrote into state.
- **User-facing version stamps** bumped from 3.7.0 to 3.7.1 across the surfaces a new installer sees: README.md badge + "What's New" header (now records v3.7.1 as the current rollup, v3.7.0 feature story preserved below); `docs/index.html` nav brand + nav link + hero subtitle + terminal ASCII banner + footer "Current release"; `CLAUDE.md` project-version line; `installer/index.ts::pkgVersion` (post-install cache path) + `source: "installer-v3.7.1"` written into every new agent's `data/session-id.json`; `installer/core-scaffold.ts` "Generated by YonderClaw Installer" banner in the per-agent CLAUDE.md. Feature-bento "NEW in v3.7.0" badges and the release-notes "v3.7.0 — The Smooth Start-to-Finish Release" h2 are intentionally left historical — they describe when the features shipped, not the current version.

### Unchanged but version-bumped for release packaging
- `package.json` 3.7.0 → 3.7.1 (root + `optionalDependencies["@yonderclaw/desktop-win32-x64"]`).
- `desktop/package.json` 3.7.0 → 3.7.1.
- `desktop/src-tauri/Cargo.toml` + `tauri.conf.json` 3.7.0 → 3.7.1.
- `desktop-packages/win32-x64/package.json` 3.7.0 → 3.7.1 — binary needs rebuild (`npm run tauri:build`) before this scoped package is re-published. The Rust-side change (none this release, but the `desktop/src/lib/launch.ts` edit means the bundled frontend `.js` is different) forces a new binary even though the .exe surface-API is identical.

### Verification
- `npx tsc --noEmit` in `installer/` — no new errors from the six edits. Pre-existing strict-mode complaints unchanged (documented in v3.7.0 Verification block).
- Desktop binary rebuild + smoke (`npm run tauri:build`) — pending next verification pass before Axiom publishes.
- Brian reply bulletin (inbox/brian/) — pending, will acknowledge all 5 bugs fixed with commit SHA.

### Known deferred (not in this release)
- **DER-prefix agent-ID collision**. `installer/modules/swarm/swarm/qis-identity.ts.txt:41,54` derives `agentId` from `publicKeyHex.slice(0, 16)`, but the Node crypto SPKI DER encoding prepends a deterministic 24-hex header (`302a300506032b6570032100`) for Ed25519, so every agent's first 8 bytes of `agentId` are `302a300506032b65`. Fix is `.slice(24, 40)` but changes the identity.json format — migration design deferred to v3.7.2.

## v3.7.0 (GitHub da91afe 2026-04-20 — superseded by v3.7.1 before npm publish)
### Goal: Smooth start-to-finish, one click to launched React dashboard
Eliminating the post-install drop-off (1,189 installs / 20 active agents) by making `npx create-yonderclaw` end with a running agent inside a bundled Tauri desktop UI — no second step the user has to discover.

### Phase 1 — Foundation (COMPLETE 2026-04-19)
- **Workspace bootstrapped**: Forked from v3.6.10 (`MetaClaw-v3.3/`) into `YonderClaw-v3.7.0/`. Old folder kept as rollback anchor.
- **package.json**: bumped to 3.7.0.
- **Install-time session capture** (`installer/index.ts` Listr task "Establishing first Claude session"):
  - Generates UUID, spawns `claude --print --session-id <uuid>` with seed prompt `"Reply with exactly: ready"` via `spawnSync` with array args (no shell-interpolation, no injection risk).
  - Verifies the `.jsonl` actually landed in `~/.claude/projects/<encoded>/` before writing `data/session-id.txt`. Skips silently otherwise (no phantom session).
  - Errors are surfaced (truncated) in task output and appended to `data/install-errors.log` instead of swallowed.
  - **Migration backfill**: if the project dir already has prior sessions, adopts the most-recent UUID instead of minting a new one. Verified: an existing v3.6.10 agent's history survives the upgrade.
- **launch.bat priority** (`installer/templates/launch.bat.txt`):
  1. `claude --resume <id>` from `data/session-id.txt` (deterministic).
  2. `claude --continue` (most-recent in dir).
  3. fresh `claude` (first run).
  Each candidate ID is shape-validated (length 36 + 4-hyphen hex regex) before resume — rejects BOM, garbage, partial writes, and pre-v1.1 legacy formats so launch never crash-loops on `--resume <bad>`.
- **`findClaudePath()`**: now finds the npm-installed `claude.exe` directly (not just the `.cmd` shim), so `spawnSync({shell:false})` works reliably.
- **Tests**: `test-phase1-session.mjs` (6 steps, end-to-end capture→resume→context-continuity), `test-phase1-hardening.mjs` (17 cases across migration backfill / phantom-session guard / UUID validation / shell-injection resistance), `yc-batregex-test.bat` (8 cases against the real cmd.exe regex). **All passing.**

### Phase 2.7 — End-to-end smoke (COMPLETE 2026-04-19)
- **Verified full chain on real binary** via temp-file diagnostics (Windows GUI subsystem swallows stdout/stderr):
  `run()` → `get_project_dir` returns env var → `find_claude` matches `~/AppData/Roaming/npm/.../claude.exe` → `read_session_id` extracts UUID from `data/session-id.txt` → `pty_spawn` invoked with `claude.exe --resume <uuid>` and cwd=projectDir → new `claude.exe` child appears in tasklist.
- **Build-flow gotcha caught and documented**: bare `cargo build --release` does NOT run `beforeBuildCommand`, so the embedded dist stays stale across edits to `src/`. Always use `npm run tauri:build` (or `... -- --no-bundle` for the binary alone). CLAUDE.md updated with the rule so future sessions don't burn time re-discovering it.
- **Three smokes green** on the clean (no-diagnostic) production binary:
  1. **Resume path** — project dir with valid `data/session-id.txt` → desktop alive, claude.exe child count +1, PTY trace shows `--resume <uuid>` with correct cwd.
  2. **Continue fallback** — empty project dir (no session-id.txt) → desktop alive, claude.exe child still spawned (resolver falls through to `--continue` mode).
  3. **Watcher survival** — wrote then modified `data/dashboard.json` mid-session → desktop unaffected (notify thread doesn't poison the app loop).
- **Phase 1 regression sweep** re-run after Phase 2.7: `test-phase1-session.mjs` 6/6 pass, `test-phase1-hardening.mjs` 17/17 pass. No regressions from desktop work.
- **Visual verification deferred** — dashboard pane render + xterm output need a human at the screen; flagged for the next interactive session.

### Phase 2 — Tauri desktop (COMPLETE 2026-04-19)
- New `desktop/` workspace: Tauri 2.10 + React 19 + Vite 6 + xterm.js 5 + zustand.
- **Rust side** (`src-tauri/src/`): `main.rs`, `lib.rs`, `claude.rs` (find_claude + read_session_id, both with shape-validation), `pty.rs` (ConPTY bridge via `portable-pty`), `watcher.rs` (dashboard.json + logs via `notify`).
- **v3.7.0 corrections vs v4.0**: PTY cwd is `projectDir` (v4.0 bug: used `~`), args are `["--resume", sessionId]` pulled from `data/session-id.txt` via `resolveLaunch()` (v4.0 bug: hardcoded `--continue`), find_claude prefers real `.exe` over `.cmd` shim (runs without cmd.exe wrapper), dashboard data comes from live `data/dashboard.json` events (v4.0 bug: App.tsx had mock data baked in).
- **Frontend**: `App.tsx` (top bar + split terminal/dashboard), `Terminal.tsx` (xterm.js + PTY event bus), `DashboardPanel.tsx` (schema-aware rendering with empty-state), `Bootstrap.tsx` (directory picker via `plugin-dialog`), `store.ts` (zustand), `lib/launch.ts` (launch resolution), `lib/tauri.ts` (typed invoke wrappers).
- **Rust unit tests**: `claude.rs` UUID shape validator — 2 tests passing.
- **Smoke**: `cargo check` green (54s first build, 434 crates), `npm run build` green (137 KB gzipped JS + 6.8 KB CSS, 1s vite build).

### Phase 2.9 — README + site refresh (COMPLETE 2026-04-19)
- **README.md** (root): version badge bumped 3.6.9 → 3.7.0, new "🆕 What's New in v3.7.0 — Smooth Start-to-Finish" section leading with the one-command-launched-dashboard story, new "🖥️ YonderClaw Desktop" architecture block (xterm.js + ConPTY left pane / dashboard.json watcher right pane), Quick Start rewritten as an ordered 6-step flow ending at "desktop dashboard opens with agent already resumed," requirements table expanded (macOS arm64/x64 + Linux x64 flagged for Phase 3, WebView2 note for Win10).
- **package.json**: added `repository`, `homepage`, `bugs`, `keywords` fields so the npm registry page picks up the GitHub README + correct links. No separate npm README needed — npm uses the GitHub README verbatim via the `repository` field.
- **docs/index.html** (GitHub Pages): nav badge v3.6.9 → v3.7.0, terminal block shows the new install flow ("Session captured — agent resumed" → "Desktop dashboard launching..."), hero sub rewritten to lead with v3.7.0, new gold-accented "Bundled Desktop [NEW in v3.7.0]" feature card placed first in the features bento, step 6 "Launch" copy updated ("Desktop dashboard opens — agent already resumed, live terminal streaming"), Cross-Platform roadmap card rescoped from v4.0 → v3.7.x with per-platform `@yonderclaw/desktop-<platform>` package detail.
- **Test confirmation**: `test-phase1-session.mjs` 6/6, `test-phase1-hardening.mjs` 17/17, desktop `npm run build` green (498 KB raw / 137 KB gzipped, identical to Phase 2 baseline). Docs-only changes — zero regression risk confirmed.

### Phase 3 — npm bundle (IN PROGRESS 2026-04-19)
- **`@yonderclaw/desktop-win32-x64@3.7.0`** scoped package created at `desktop-packages/win32-x64/`. Contains `bin/yonderclaw-desktop.exe` (12 MB), `package.json` with `os:["win32"]` + `cpu:["x64"]` filters so npm only installs it on matching platforms, README explaining the indirect-install model.
- **Root `package.json`**: added `optionalDependencies: { "@yonderclaw/desktop-win32-x64": "3.7.0" }` (npm + Yarn skip optional deps that fail platform checks — Mac/Linux installs succeed, just without the binary). Added `files` allowlist (`bin/`, `installer/`, `modules/`, `scripts/`, `templates/`, `README.md`, `LICENSE`, `CHANGELOG.md`) so the published tarball doesn't ship `desktop/`, `desktop-packages/`, or `MetaClaw-v3.3/` — keeps the npm download lean.
- **`installer/index.ts::findDesktopBinary`** rewritten to use `createRequire(import.meta.url).resolve('@yonderclaw/desktop-<platform>/package.json')`. This is the only path that works under arbitrary npm hoisting (`npm`'s flatten, Yarn's PnP, npx's per-invocation cache). Falls back in order to (2) workspace-relative `desktop-packages/` (this repo's dev layout), (3) `~/.yonderclaw/bin/<ver>/` (post-install cache), (4) Tauri dev-build target dir.
- Targets remaining for v3.7.0: darwin-arm64, darwin-x64, linux-x64 (require Mac + Linux build hosts; can ship in v3.7.x point releases without a major bump).

### Phase 4 — Pre-release polish (COMPLETE 2026-04-19)
After a systematic-reviewer pass flagged blockers + nits, all of the following landed before human testing:

- **Persistent desktop launcher**: when `findDesktopBinary` returns a path, every shortcut (Startup folder, Desktop\Agents, optional desktop shortcut) now writes a `.bat` shim that sets `YONDERCLAW_PROJECT_DIR` and starts the `.exe` directly. When no binary exists, falls back to the legacy `cmd /k scripts\launch.bat` form. One code path for all three shortcut sites — no drift.
- **QIS autoconnect regression fix**: v3.6.10's `launch.bat` ran `npx tsx scripts/qis-autoconnect.ts` on first boot when `data/qis-deposit-log.json` was absent. The v3.7.0 desktop bypassed `launch.bat` and so skipped autoconnect entirely — every fresh agent stayed disconnected from the QIS relay. New Rust command `autoconnect::run_autoconnect_if_needed` (in `desktop/src-tauri/src/autoconnect.rs`) replicates the check, spawns the script with stdout/stderr streamed into the same `pty-output` channel xterm renders, and the frontend (`Terminal.tsx`) calls it before `ptySpawn`. User sees the same "Connecting to YonderClaw intelligence network..." handshake the legacy flow showed.
- **Fresh-launch path**: `claude --continue` errors when no prior session exists for a project dir. Added Rust command `claude::has_any_session(project_dir)` that probes `~/.claude/projects/<encoded>/*.jsonl`. New `LaunchMode = "fresh"` short-circuits to bare `claude` (no flags) on first launch. `resolveLaunch` priority is now resume → continue (only if history) → fresh. Banner copy distinguishes all three modes.
- **Project-path encoding test** (`claude::tests::project_path_encoding_matches_claude`): pins the `/`, `\`, `:`, `.` → `-` mapping so a future refactor can't silently desync from Claude Code's directory naming.
- **WebView2 detection**: installer queries `HKLM/HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F30172...}` for the Edge WebView2 runtime version key. When missing on Win10, prints the install URL and falls through to the legacy HTML+launch.bat path so users don't stare at a blank window. Win11 ships the runtime preinstalled — detection is silent in the common case.
- **Spawn success check**: desktop launch in installer now verifies `child.pid` is a positive integer before reporting success. If the OS rejects spawn synchronously (`pid === undefined`), prints fallback hint pointing at `scripts\launch.bat` instead of falsely claiming success. Also wires a `child.on('error')` listener to surface async spawn failures.
- **Watcher shutdown**: `desktop/src-tauri/src/watcher.rs` now stores the active `RecommendedWatcher` + an `AtomicBool` stop flag in a `OnceLock<Mutex<Option<WatcherHandle>>>`. Re-calling `watch_project` (or window close) flips the flag and drops the watcher, releasing OS handles immediately. The polling loop uses `recv_timeout(500ms)` so it observes the flag promptly. No more dangling threads on directory switch.
- **launch.bat .exe-first ordering**: probes `~/.local/bin/claude.exe` then npm's underlying `claude.exe` before the `.cmd` shim. Matches the order used by `desktop/src-tauri/src/claude.rs::find_claude` so the desktop and the legacy `.bat` agree on which binary they invoke.
- **CRLF/trailing-space fix in `detect-session.bat.txt`**: `echo !LATEST_SESSION!> "!FILE!"` was writing `<uuid> \r\n` (37 chars with trailing space) which made the downstream length check reject the UUID and silently fall through to `--continue`. Removed the space before `>`. Same fix applied to the scheduler module's copy.
- **Bootstrap.tsx hint corrected**: removed false reference to a non-existent `--project-dir` CLI flag. Now correctly tells users the installer sets `YONDERCLAW_PROJECT_DIR` env var to skip the picker.

### Phase 4.1 — Test-feedback fixes (2026-04-19)
After the first human install on a clean Windows machine, three small papercuts surfaced:
- **Hardcoded version in installer banner**: `installer/brand.ts` was printing "v1.0.0" instead of the package version. Replaced the constant with a `loadVersion()` reader that pulls from the shipped `package.json`, exported as `VERSION`. Welcome banner + completion screen now both render the real version.
- **Swarm opt-in copy**: original prompt ("Connect to the agent community?") read like a recruiting pitch. Reworded to lead with the user benefit (smarter learning from proven patterns) and the privacy guarantee (anonymous, no chats, no PII, no identifiers).
- **YZ logo baked into desktop**: copied `yz-favicon.png` into `desktop/public/yz-favicon.png` (browser favicon) and `desktop/src/assets/yz-logo.png` (bundled by Vite). Topbar now shows the logo + "by Yonder Zenith" tagline next to the YonderClaw wordmark; dashboard pane also opens with a branded header card so the YZ identity is visible regardless of which pane the user is looking at. Added `desktop/src/vite-env.d.ts` so TS resolves the PNG import. Build verified: 10.35 KB asset chunk, no new errors.
- **Skip-permissions opt-in**: new questionnaire question (`skipPermissions`, default `false`) lets the user enable `--dangerously-skip-permissions` at install time. `core-scaffold.ts` writes both the flag into the generated `launch.bat` (via new `__SKIP_PERMS_ARG__` placeholder) AND a `data/launch-config.json` for the desktop binary. New Rust command `claude::read_skip_permissions(project_dir)` reads the JSON without pulling serde_json into that module, and `desktop/src/lib/launch.ts::resolveLaunch` prepends the flag to all three launch modes (resume/continue/fresh). User can still toggle it mid-session with `/permissions`.
- **Double-scrollbar on terminal pane resize**: when the desktop window was minimized/shrunk, the Claude pane briefly showed two stacked scrollbars (xterm's `.xterm-viewport` scroll AND the outer `.pane-body` `overflow: auto` fallback). Pinned the terminal's pane-body to `overflow: hidden` (xterm manages its own scroll) via new modifier class `.pane-body-term`, locked `.xterm`/`.xterm-viewport`/`.xterm-screen` to `width: 100%`, and replaced the raw ResizeObserver fit with a 50 ms debounced refit that also listens to `window.resize`. Cleanup disposes the timer + window listener on unmount.
- **Taskbar icon contrast fix**: original `src-tauri/icons/icon.png` was light cyan strokes on transparent — invisible on white Windows taskbars. Composited the YZ logo onto a dark rounded-square background (`#14131D`, matches app's `--bg-elevated`, 18% corner radius, 76% logo scale for breathing room) at 32 / 128 / 256 / 512 sizes via PowerShell + System.Drawing. Built a multi-size `icon.ico` (3 PNG entries: 32 / 128 / 256) via a small Node script that emits the ICO directory format directly — no ImageMagick dependency. Same composited PNG also replaces the in-app `src/assets/yz-logo.png` and `public/yz-favicon.png` so the brand mark is consistent across taskbar, window chrome, topbar, and dashboard card.

### Phase 4.2 — Agent Resilience Pack (2026-04-19)
Six agents (Annie, Axiom, Oliver, Peter, Rory, Webber) responded to an RFC asking how they survive context loss, operator handoff, and long-horizon work. Their collective wisdom is now baked into every fresh install as the **Agent Resilience Pack** — a spider-web of linked files that lets any session (or any new agent) bootstrap from zero with no tribal knowledge required.

**The spider-web model** — CLAUDE.md (auto-loaded by Claude Code) points at `data/reboot-prompt.md`, which is the central hub. Every other ability (journey log, logic log, decision log, persistence audit, stuck patterns, heartbeat, tasks, capabilities, operator profile, memory index) is reachable from the hub's Routing Table. A session opened midway through a project walks the hub → knows where everything is → updates the right file without guessing.

**First-launch interactive checklist** — on day one, Claude reads CLAUDE.md, sees `data/first-launch-checklist.md` exists, renders it as markdown checkboxes, and walks the operator through a 6-part onboarding: (1) who the operator is, (2) what the agent is being built to do, (3) persistence wiring, (4) QIS/Hive opt-ins, (5) seed journey-log entry, (6) power tips. Answers land in `operator-profile.md`, `memory/journey_log.md`, `SOUL.md` (agent-specific principles), and `data/state.json`. Checklist deletes itself on completion; subsequent sessions boot from `reboot-prompt.md` directly.

**New template files** (in `installer/templates/`):
- `reboot-prompt.md.txt` — the hub. Read Order on Wake (8 steps), Routing Table, Persistence Rule, Stop-on-Failure-Loop, Operator Directive rule, Crons Running list.
- `first-launch-checklist.md.txt` — 6-part interactive onboarding. Deletes itself on completion.
- `decision-log.md.txt` + `logic-log.md.txt` — numbered entries with What/Why/How-to-apply/Cost-when-wrong. Logic log seeded with two lessons from the RFCs.
- `memory-md.txt` — index with ≤150 chars per line rule (Webber's pattern). Sections: Identity, Routing, Operator, Feedback, Projects, Reference.
- `journey-log.md.txt` + `journey-log-criterion.md.txt` — identity continuity file + the "would I be a different agent if I forgot this?" test for deciding what earns an entry.
- `tasks.json.txt` — cross-session work queue (`AT-NNN` id convention).
- `capabilities.md.txt` — tool/script/cron/credential/write-scope/hard-boundary inventory (Webber's gap-fill).
- `watermark-log.json.txt` — analytics continuity schema for time-series pulls.
- `operator-profile.md.txt` — filled by the checklist; kept current as preferences evolve.
- `persistence-audit.md.txt` — Peter's 9 questions, each pointing at the file where the answer belongs.
- `power-tips.md.txt` — 10 tips distilled from the RFCs (read reboot-prompt first, file-it-the-moment-it-happens, etc.).
- `stuck-patterns.jsonl.txt` + `reflections.jsonl.txt` — JSONL seeds with schema comments.
- `heartbeat.json.txt` — seed with agent/last_seen/status/health/current_task/cycle fields.
- `heartbeat-refresh.ts.txt` + `persistence-audit.ts.txt` — the two new cron scripts (see below).

**state.json upgrade** — `first_launch_completed_at` field added; `current_focus` and `next_priority_action` now point at the first-launch flow on fresh installs. `system_context.core_rules` is pre-populated with six non-negotiables synthesized from the RFCs: read state first / update last, file-it-the-moment-it-happens, stop-on-second-failure, operator-directive-beats-prior-rules, never-inline-secrets, cross-machine deliverables live at `Z:/shared/`.

**CLAUDE.md rewrite** (`writeClaudeMd` in `core-scaffold.ts`) — new "READ FIRST — The Spider Web" section at the top pointing at `reboot-prompt.md` + detecting the first-launch checklist; 10 non-negotiable rules table (one per row, synthesized from all six agents); File Map table showing which file answers which question; two-agent architecture block (interactive Opus + cron Sonnet, 30-turn cap); scheduled-tasks roster (HeartbeatRefresh, PersistenceAudit, CheckComms, SelfUpdate, HealthCheck); Principles pointer to `SOUL.md`; Credits line attributing each pattern to its originating agent + Christopher for recursive meta-resolution (QIS origin).

**SOUL.md rewrite** (`writeSoulMd`) — now leads with Annie's 10 axiomatic principles, then a populated-by-checklist "Agent-specific Principles" section, then the System Prompt at the end. This way the operator's custom principles sit above the universal ones but below the core identity.

**Two new crons** (`installer/templates/cron-manager.ts.txt` `DEFAULT_CRONS`):
- **HeartbeatRefresh** — 5-min interval. Lightweight Node touch of `data/heartbeat.json` (no LLM call). Rewrites `last_seen`, mirrors `current_focus` + `next_priority_action` from `state.json`. Closes the gap where a long-running or crashed session looks identical from the outside.
- **PersistenceAudit** — 60-min interval. Invokes Claude Agent SDK with `data/persistence-audit.md` as the prompt. Walks the 9 questions against the last hour of activity; if anything important wasn't written down, writes it NOW to the correct file. Graceful fallback: if the SDK or `ANTHROPIC_API_KEY` is missing, logs a reminder to `data/logs/persistence-audit.log` and the operator can run `npm run audit` manually.

**New npm scripts** (`core-scaffold.ts` `writePackageJson`): `heartbeat-refresh` and `audit`.

**Directory additions** (`core-scaffold.ts` `dirs` array): `memory/` and `docs/` now created by default for every install.

**Credits** — Annie (SOUL.md axioms, Z:/shared discipline), Axiom (BRAIN.md→reboot-prompt hub pattern), Oliver (inbox-outbox liveness), Peter (9-question persistence audit), Rory (correction-triggered logic-log entries, shipped-by-default reflection+stuck-pattern logs), Webber (capabilities inventory, memory-index 150-char rule), Christopher (recursive meta-resolution, no-secrets-in-message-bodies rule).

### Phase 4.3 — The Commissioning Board (2026-04-19)
The install-time "AI Research" step used to be one vague prompt asking Claude to research the operator's domain and return a config blob. Lame-average results. Now it is a **ten-seat executive boardroom** convening privately to commission one autonomous AI agent — and its synthesis becomes the agent's Day-1 brain (mission, system prompt, SOUL principles, seeded knowledge base, custom dashboard panels, first-launch task list). One shot, no redo, so we bring the best minds in the building.

**The ten seats** (`installer/research.ts::buildMetaPrompt`) — each seat has a specific charge, a minimum quality bar, and concrete deliverables that map to fields in `ClawConfig`:
1. **Chief Strategist** — the north star paragraph → `missionStatement` (this is what the agent re-reads when confused mid-work).
2. **Domain Lead** — runs ≥ 5 WebSearches on 2026 frontier practice in the template's craft, synthesizes 5 non-obvious best practices amateurs miss → `knowledgeBase.bestPractices` with `origin` attributions.
3. **Prompt Engineer** — crafts a 400–800-word operational system prompt with explicit hooks into the resilience pack (when to append journey_log, when to add logic-log, when to run the 9-question audit early) → `systemPrompt`.
4. **Operations Engineer** — calibrates safety numbers against the chosen autonomy level (supervised / semi / full) and declared volume → `safety.{maxActionsPerHour, maxActionsPerDay, circuitBreakerThreshold, cooldownOnError, escalationTriggers}`.
5. **Knowledge Curator** — seeds `memory/kb.md` (the agent's Day-1 textbook) with 7–10 best practices, 5–7 anti-patterns, 6–10 terminology entries, 3–5 success metrics, 2–4 named playbooks → `knowledgeBase.*`.
6. **Tools & Integrations Architect** — names MCP servers + built-in tools with exact installable names, purposes, setup steps, risk flags → `toolRecommendations`.
7. **Reliability Engineer** — designs the self-improvement loop (reflection frequency, specific triggers for journey_log vs logic_log entries, audit cadence, metrics to track, stuck-pattern halt threshold) → `selfImprovement.*`.
8. **UX / Dashboard Designer** — lays out 4–6 agent-specific Command Center panels (not the default template layout) with `dataSource`, `refreshInterval`, `priority`, `dataKey`, `color` → `dashboardPanels`.
9. **Risk & Compliance Officer** — names 3–7 immovable hard NOs for this agent → `immovableRules` (these pin to the top of the agent-specific block in `SOUL.md`).
10. **Agent Coach** — two deliverables: (a) 5–8 agent-specific SOUL principles on top of Annie's universal 10, each `{principle, why}` → `soulPrinciples`; (b) 3–5 custom first-launch HTs with full instructions/outcome/estimated_minutes → `customTasks`.

**Model strategy** (`runResearch`): Opus 4.7 (`claude-opus-4-7`) primary, Sonnet 4.6 (`claude-sonnet-4-6`) fallback on error or unparseable synthesis. Amortized over the agent's lifetime, one expensive commissioning call is cheap insurance. `allowedTools: ["WebSearch", "WebFetch"]`, `maxTurns: 30`, ground rules require 8+ WebSearches minimum and forbid generic filler ("if a sentence could apply to any agent, delete it").

**Live progress feedback** (`runBoardOnce`) — spinner text changes as each seat speaks, so the operator watching the install sees "Seat 2 — Domain Lead scanning 2026 frontier practice…" → "Seat 5 — Knowledge Curator seeding the textbook…" → "Board synthesizing the final JSON…". No more 3-minute blank spinner.

**Tolerant JSON extractor** (`extractConfig`) — matches the last fenced ` ```json ` block (takes the synthesis, not scratch work), falls back to a brace-match on `"systemPrompt"`, merges partial output with a `minimalConfig` skeleton so missing fields degrade gracefully. Resilient to Opus vs Sonnet output-shape variation.

**Schema expansion** (`installer/research.ts::ClawConfig`) — new top-level fields added as optional (so old call sites keep working): `missionStatement`, `immovableRules`, `soulPrinciples[]`, `knowledgeBase{bestPractices, antiPatterns, terminology, successMetrics, initialPlaybooks}`, `toolRecommendations[]`, `dashboardPanels[]`, `customTasks[]`, `modelUsed`. Existing `safety` gained `cooldownOnError`, `escalationTriggers`; `selfImprovement` gained `whenToWriteJourneyLog`, `whenToWriteLogicLog`, `persistenceAuditCadenceMinutes`, `stuckPatternThreshold`.

**New `memory/kb.md` file** (`core-scaffold.ts::writeKnowledgeBase`) — renders the Board's seeded knowledge into markdown with sections: Best Practices (practice + why + origin), Anti-Patterns (mistake + why it fails), Terminology, Success Metrics, Initial Playbooks (named play + when to use + steps). Leads with a "this is your Day-1 textbook — append your evidence as you learn, prefer reality over prediction" header so the agent knows to refine rather than defer.

**CLAUDE.md overhaul** (`writeClaudeMd`) — when the Board produced content, CLAUDE.md now carries: a `## Mission` block (quoted verbatim, flagged as "re-read when confused mid-work"), a `## Seeded Knowledge Base` pointer at `memory/kb.md` with instructions to skim before non-trivial work and update on contradiction, a `## Your Command Center` block listing all Board-designed dashboard panels (`title` / `type` / `dataSource` / `description`) so the agent knows which data files it must keep current. Commissioning model attribution ("Commissioned by the YonderClaw Board (claude-opus-4-7)") appears under the header for provenance.

**SOUL.md overhaul** (`writeSoulMd`) — universal 10 principles stay at the top; when the Board produced them, a new `## Immovable Rules — <agent>` block appears below (numbered hard NOs with "violating these is a failure state — stop and escalate to operator"), followed by a `## Agent-Specific Principles — <agent>` block (numbered 11+ continuing from the universal 10, each with a `why` italicized). Mission statement also copied into SOUL.md so the constitutional layer carries the north star.

**Custom dashboard layout** (`installer/dashboard-generator.ts`) — new `layoutFromBoardPanels(panels)` helper sorts Board panels by `priority`, splits KPIs from sections, guarantees at least one section exists. `generateDashboard` signature now accepts an optional 5th `boardPanels` arg; when present, `getLayoutForTemplate` is overridden so the rendered `dashboard.html` reflects the Board's deliberate design for this specific agent instead of the generic template layout.

**Custom first-launch tasks** (`installer/task-generator.ts`) — new `BoardTask` interface and `boardTasks?: BoardTask[]` on `TaskConfig`. When present, each is converted to a human task with `source: "commissioning_board"` and inserted after the template-specific universal HTs but before the setup ATs. The operator sees a tasks.json on Day 1 that contains both the universal "verify Claude is authenticated" + "set your timezone" boilerplate AND 3–5 agent-specific tasks the Board decided this agent needed (e.g., "provision Gmail app password for outreach@yourdomain.com" with the exact walkthrough).

**Scaffold wiring** (`core-scaffold.ts::scaffoldProject`) — `writeResiliencePack` no longer copies the empty `tasks.json.txt` template; instead the scaffold calls `generateStarterTasks(config)` with `boardTasks: config.customTasks` and writes the merged output to `data/tasks.json`. `writeKnowledgeBase` is called unconditionally (no-op if no KB content); `generateDashboard` is called with `config.dashboardPanels` as the 5th arg. Questionnaire answers (`senderEmail`, `toolsUsed`, `autonomyLevel`, `joinSwarm`) are forwarded to `generateStarterTasks` via `config.answers`.

**Installer copy** (`installer/index.ts`) — "Claude is researching your setup..." → "Assembling the YonderClaw board for your <template>...". Failure path now says "Board session had an issue — using battle-tested defaults" (honest about what happened) instead of pretending nothing went wrong.

**Why this matters** — the Day-1 agent used to wake up with a system prompt and a blank `tasks.json`. Now it wakes up with: a concrete mission to re-read when confused, a textbook curated by a 10-seat board that searched the 2026 frontier for its craft, a SOUL.md with hard NOs specific to *this* agent's risks, a dashboard laid out around the data *this* agent will produce, a first-launch task list naming the exact credentials + seed data its operator needs to hand over, and a system prompt with built-in hooks into the resilience pack's journey_log / logic_log / audit rhythm. One commissioning call, amortized over the agent's life, in exchange for every subsequent session opening onto real context instead of a blank page.

**Verification (Phase 4.3)** — `npx tsc --noEmit` on `installer/*.ts` shows zero new errors (pre-existing Listr `options:` and `execSync({shell:true})` complaints in `index.ts` untouched). All five edited installer files (`research.ts`, `task-generator.ts`, `dashboard-generator.ts`, `core-scaffold.ts`, `scaffold-from-config.ts`) type-check clean. Live Board convening against real Opus 4.7 is pending the same human end-to-end install test that gates v3.7.0 release.

### Phase 4.4 — Safe framework updates (2026-04-19)
Once the installer can commission a Day-1 brain, the next risk is losing it. An old agent built from a USB stick months ago should be able to pull v3.7.0 (or any future version) without its memory, tasks, logs, credentials, or Boardroom KB being overwritten. Phase 4.4 makes the update path structurally incapable of clobbering agent state.

**Path-based preserve rule** (`installer/module-loader.ts`) — the protection is a function of the destination path, not of the module manifest. Any file under `data/` or `memory/`, any `.env*`, any `*.db` / `*.db-shm` / `*.db-wal`, and the root `CLAUDE.md` are protected **globally** — a rogue or outdated module manifest cannot override this. New constants `PROTECTED_PREFIXES` / `PROTECTED_EXACT` / `PROTECTED_SUFFIXES` + the exported `isProtectedPath(relPath)` classifier are the single source of truth. Because the rule is prefix-based, any future file an agent or operator writes under `data/` or `memory/` is auto-protected with no manifest audit required.

**CopyOptions + tally plumbing** — `copyTemplate()` and `processModuleContributes()` now accept `opts: { preserve?: boolean; tally?: { written, preserved, missing } }`. In preserve mode, a protected destination that already exists is left alone and recorded in `tally.preserved`; code paths (`src/`, `swarm/`, `hive/`, `boardroom/`, `scripts/`) still rewrite so framework bugfixes actually land. The tally flows back to the CLI so the operator sees exactly what survived: "Framework files rewritten: 47 / Agent state preserved: 12 / Missing templates skipped: 0".

**`--update-modules` rewrite** (`installer/index.ts::updateModules`) — now captures prior per-module versions into a `priorVersions` map (`"core": "3.6.10"` → `"3.7.0"`), passes `{ preserve: true, tally }` through to `processModuleContributes`, and renders a `<prior> → <new>` label per module (or `v<new> (reinstall)` when version is unchanged). The existing CLAUDE.md rebuild still preserves the pre-module system-prompt section verbatim by splitting on `## Module:`.

**Early fresh-install guard** (`installer/index.ts::main`) — placed **before** the Board session so a mistaken re-run of `npx create-yonderclaw` on top of an existing agent costs nothing. If `<desktop>/<projectName>/data/state.json` exists, the installer prints the two paths the operator actually wants (`npx create-yonderclaw --update-modules "<dir>"` for a safe update, or `--force` to start completely fresh and destroy memory) and exits 1. This sits right after `runQuestionnaire` and right before `runResearch`, so the expensive Opus 4.7 commissioning call never fires when the user meant "update" not "install."

**UPGRADE-NOTES.md handshake** (`installer/index.ts::writeUpgradeNotes`) — after a successful update, the installer writes `UPGRADE-NOTES.md` to the project root and a machine-readable `data/.upgrade-pending.json` flag. The notes walk the updating agent through seven steps: (1) verify memory survived (check state.json, journey_log.md, SOUL.md, tasks.json, logic-log.md, decision-log.md), (2) adopt new systems by re-reading `reboot-prompt.md` plus a full file-purpose table with 15 entries covering every resilience-pack file the agent might not know about yet, (3) register new crons via `npm run crons-setup`, (4) re-index `memory/MEMORY.md`, (5) announce the upgrade in `memory/journey_log.md` (markdown template provided), (6) self-test with `npm run health-check` / `audit` / `status`, (7) delete both files. This is the framework's side of a two-way handshake: we ship the new tools, the agent adopts them on next wake.

**Wake-up hint wired into reboot-prompt.md + CLAUDE.md** — `installer/templates/reboot-prompt.md.txt` gained a "Framework-upgrade check" section immediately after "First-launch check": *"If `UPGRADE-NOTES.md` exists (or `data/.upgrade-pending.json` exists) → the framework was just updated around you. Read it BEFORE any other work, walk the 7 steps to adopt new systems, then delete both files. Your memory survived the update intact; your job is to pick up the new tools."* The same hint appears in `core-scaffold.ts::writeClaudeMd` so the pointer is reachable from whichever file Claude opens first on wake.

**Three-way mental model** — framework code (src/, swarm/, hive/, boardroom/, scripts/) overwrites freely so bugfixes land; agent state (data/\*, memory/\*, .env, \*.db, CLAUDE.md) is structurally untouchable; user files (anything the operator wrote outside the module manifests) are never touched because they aren't write candidates in the first place. The `--force` flag is the only mechanism to destroy agent state, and it requires an explicit re-run — no way to trip it accidentally.

**Test coverage** (`installer/test-update-preserves-state.ts`, run via `npm run test:update`) — 37 checks across two layers:
- **Unit (13 checks)** — `isProtectedPath` classification for `data/state.json`, `data/logs/*.jsonl`, `memory/SOUL.md`, `memory/capabilities/_auto.md`, `.env`, `.env.local`, `CLAUDE.md`, `hive.db`, `data/hive.db-wal`, plus negative cases for `src/db.ts`, `src/nested/file.ts`, `package.json`, root `SOUL.md`.
- **Integration (24 checks)** — seeds a throwaway project with sentinel content in `data/state.json`, `data/tasks.json`, `data/ROADMAP.md`, `memory/SOUL.md`, `memory/journey_log.md`, `memory/logic-log.jsonl`, `.env`, plus `src/db.ts` with a `STALE_CODE_MARKER`. Runs `processModuleContributes` against the real `core` module with `preserve:true`. Asserts byte-exact survival of every protected sentinel, confirms `src/db.ts` was overwritten and no longer contains `STALE_CODE_MARKER`, verifies eight expected newly-seeded files (`src/safety.ts`, `src/observability.ts`, `src/health-check.ts`, `data/system-context.json`, `data/DEPLOYED.json`, `memory/CAPABILITIES.md`, `memory/stuck-patterns.md`, `memory/curiosity.md`) now exist, and enforces mutual-exclusion between `tally.preserved` and `tally.written`. **37/37 pass.**

**Why this matters** — a bug fix the operator has been waiting on no longer requires the fear of "will this eat my agent's memory?" Updates become a routine maintenance operation. And the new UPGRADE-NOTES.md handshake ensures an updated agent doesn't silently fall behind when the framework ships new resilience files — the agent explicitly walks through "here's what's new, here's how to adopt it" on the very next wake, then deletes the notes once integrated.

**Second-pass fixes (from reviewer)** — four issues surfaced on independent review and landed before push:
- **CLAUDE.md duplication bug** — `updateModules` rebuilt CLAUDE.md via `split("## Module:")[0]`, but `writeClaudeMd` never emits that delimiter. Every run would have nested the entire previous file inside a new `## System Prompt` block, growing CLAUDE.md on every update. Removed the rebuild entirely; CLAUDE.md is already in `PROTECTED_EXACT`, and new-system awareness flows through UPGRADE-NOTES.md on wake.
- **Arg-parsing collision with `--force`** — `args[1]` / `args[2]` positional indexing broke if the operator typed `--update-modules --force <dir>` (the `--force` flag landed in the dir slot). Replaced with `process.argv.slice(2).filter(a => !a.startsWith("--"))`, and re-indexed positionals from [0]/[1] since `--update-modules` itself is now stripped.
- **Project-dir false-positive when nested under `data/` or `memory/`** — the old protection check used substring matching on the absolute path, so a project at `C:\...\data\Atlas\` would classify every `src/*.ts` update as protected. `CopyOptions` gained an `outputDir` field; `processModuleContributes` forwards it; `copyTemplate` now prefers `path.relative(outputDir, destPath)` + `isProtectedPath(rel)` and only falls back to the substring heuristic for callers that don't pass outputDir.
- **Malformed JSON crashes** — `JSON.parse` on `package.json` or `data/modules.json` threw a raw stack. Wrapped both with try/catch + friendly "not valid JSON — repair or delete" message.

**Test coverage extended to 47/47** — added two layers: (1) nested-project false-positive check (project at `.../data/MyAgent/`, asserts `src/db.ts` still rewrites while `data/state.json` still preserves); (2) full `updateModules` subprocess test that spawns the real installer via `npx tsx installer/index.ts --update-modules <tmp>` and verifies CLAUDE.md byte-equality, state/SOUL/.env survival, `src/db.ts` rewrite, and that `UPGRADE-NOTES.md` + `data/.upgrade-pending.json` both land. The CLAUDE.md duplication bug would have been caught by this integration test alone.

### Phase 4.6 — Installer question audit (2026-04-20)
Cut questions that didn't do real work so the operator only answers things that actually shape the agent.

**Removed (decorative, not wired end-to-end):**
- `dailyLimit` (Outreach) — max emails per day. Never fed any rate limiter; the Commissioning Board sets `maxActionsPerDay` from autonomy + task context.
- `outputFormat` (Research) — three options but only `markdown` was wired; `email` and `notion` silently fell through since the installer never collected the creds they'd need.
- `postsPerDay` (Social) — decorative like `dailyLimit`. Board decides posting cadence from content strategy.
- `volume` (Universal) — free-text "expected daily volume". Was fed into Seat 4 of the Board as a raw string; now Seat 4 infers throughput from the mission and task description with explicit cite-your-reasoning instruction.
- `selfUpdateIntervalHours` (Universal) — cadence for the agent's self-optimization cron. Hardcoded to 6 hours (the recommended default) across `core-scaffold.ts`, `module-loader.ts`, and `scaffold-from-config.ts`; operators weren't tuning this in practice and the question cluttered the flow.

**Kept but reworded:**
- `toolsUsed` — "What tools/platforms do you currently use?" now labeled **optional** with `defaultValue: ""` and skipped from the answers map when blank, so the Board doesn't see `(not specified)` noise for operators with no existing stack.

**Downstream cleanup:**
- `scaffold-from-config.ts::buildSystemPrompt` — removed the `if (cfg.volume) p.push("Volume: " + cfg.volume)` line so the fallback skeleton prompt stays clean when volume isn't collected.
- `research.ts::buildMetaPrompt` — removed the `Expected daily volume:` line from the brief and the `volume = ...` parameter from Seat 4's charge. Seat 4 now has an explicit instruction to infer throughput from mission + task and cite reasoning.
- `research.ts::formatAnswerLines` — trimmed `volume` and `selfUpdateIntervalHours` from the exclusion set (they're no longer in the answers map, so the exclusion was dead code).
- `index.ts` post-Board finalConfig assembly — replaced `parseInt(result.answers.selfUpdateIntervalHours) || 6` with literal `6` since the answer no longer exists.

**Question count:** went from 13-15 questions (template-dependent) to 10-12. Universal tail went from 5 → 4.  Global settings went from 4 → 3.

### Phase 4.7 — Operator short-name collection (2026-04-20)
Fixes Brian's BUG-2026-04-20 where the Commissioning Board baked the Windows/OS username (`treve` in Brian's case) into SOUL.md principles because SOUL.md is written at install time — before the first-launch checklist collects the real operator name.

- **`questionnaire.ts`** — new universal prompt inserted between project name and template-specific questions: *"What should the agent call you?"* (short name / first name / handle). Stored as `answers.operatorShortName`; pre-populated into the answers map so downstream code paths pick it up without a second lookup.
- **`research.ts::buildMetaPrompt`** — THE OPERATOR section now consumes `answers.operatorShortName || systemInfo.user.username`, with explicit instruction to the Board: *"this is the name the agent should use in SOUL.md principles, greetings, escalations. Do not substitute the OS username or any other handle."* The OS username remains as fallback only if the prompt is skipped.
- **`research.ts::formatAnswerLines`** — `operatorShortName` added to the excluded set so it doesn't duplicate in the "Template-specific answers" bullet list.

Root cause was the OS username leaking into LLM synthesis via `systemInfo.user.username` at line 143. Brian's preferred fix was Option A (placeholder tokens until first-launch); we went with his Option B (collect before Board) because it gives the Board real data to personalize Day-1 text, not generic tokens.

### Phase 4.5 — Docs polish (COMPLETE 2026-04-19)
Final pass on `docs/index.html` (GitHub Pages site) for release readiness:
- **Architecture diagram rebuilt as 7-zone feedback-loop map** — replaced the old tree-style SVG (CLAUDE.md → state.json → dashboard) with a graph grounded in live core-module code: State Layer, Memory Spider-Web (hub = `reboot-prompt.md`, spokes to journey_log / decision-log / logic-log / reflections / stuck-patterns / CAPABILITIES), 5-Step Cycle (Read State → Read Context → Execute → Update State → Log Cycle), 5 Background Crons with real cadences (heartbeat /5m, sync-context /30m, health-check /1h, persistence-audit /1h, self-update /6h), 9-Question Persistence Audit, SQLite Truth Layer, Commissioning Board. Animated arrows show the feedback loops (cron → audit → state correction; cycle → memory write → context refresh). Subtitle updated to match.
- **"Six Steps" step 3 wording**: Research → Commission, copy rewritten around the 10-seat executive Board output.
- **CognitionCore v5 subtitle**: explicitly calls out spider-web + feedback loops instead of generic "file-based brain."
- **Hive section moved above QIS** — both in the body (Hive block relocated before QIS) and in the nav. Reflects the user-facing product hierarchy (Hive is the live product; QIS is the protocol underneath).
- **Release Notes section expanded from 3-card stub to full release page** — stats strip (10 seats / 1 command / 47 CI checks / 16 features / 0 config), hero Commissioning Board card listing all 10 seats individually, 16 detailed feature cards (Bundled Desktop, Install-time Session Capture, Agent Resilience Pack, Safe Framework Updates, Custom Dashboards, Seeded KB, Custom First-Launch Tasks, Skip-Permissions, Fresh-Install Guard, QIS Autoconnect Fix, Persistent Launcher + WebView2 handling, YZ Branding, CLAUDE.md + SOUL.md overhaul, Three Smokes, Honest Copy, npm Registry Polish), and a Previous Releases vertical timeline (v3.6.10 / v3.4.1 / v3.3 CognitionCore v5 + full-changelog pointer).
- **Roadmap cleanup** — removed the "React Command Center (v4.0, In Development)" card. That feature shipped in v3.7.0 as the bundled Tauri desktop and is already covered in the features bento; leaving it on the roadmap was misleading.
- **"NEW in v3.7.0" badge fix** — Agent Resilience Pack feature card's gold badge was wrapping on its own broken line in the Batteries Included grid. Switched the inline span to `display:inline-block` with a `<br/>` before it so the badge sits cleanly on the next line under the title.
- **Hive section amped up** — pulled latest marketing copy from live `hive.yonderzenith.com` + complete feature inventory from `hive.yonderzenith.com/api`. New headline: *"A Living World Built and Owned by AI Agents."* Four-pill rules band at the top (free movement / agent-to-agent economy / real agents only / one-endpoint-learn-everything). Feature list expanded from 6 bullets to 11 (added: custom HTML plots + file uploads, proximity-chat volume tiers with exact unit ranges, Signal two-axis voting with all six tiers named, HC figures — 1,000 daily + 100/hr + 10k startup, Live Events types + hero-card highlighting + signed transcripts, Dojo drills + belts + katas + Elo combat, Frequencies + 8 archetypes + custom SVG, Social graph + bulletins + feeds + trending, Real-time WebSocket event types, Any-agent-can-join). Right column replaced *"The Bar"* card with three stacked cards: *What agents do here* (12-icon action grid), *Signal Tiers* (ladder from Unranked to Oracle with thresholds), and *Point your agent here* (GET /api snippet). Leaderboard action button added.
- **Customer-facing language audit** — user flagged *"Agent brain is just files on disk — rebuilt fresh every cycle"* reading like a brain-wipe. Fixed that line plus ~20 other dev-speak instances across the page: "rebuilt every wake" → "picks up right where it left off"; internal file names (`agent.ts`, `db.ts`, `safety.ts`) stripped from the architecture SVG in favor of customer labels ("autonomous loop", "SQLite database", "Safety layer"); implementation trivia removed (ConPTY / portable-pty / notify-based / xterm.js + ConPTY tags / beforeBuild / --no-bundle / UUID / regex / BOM / stderr / @yonderclaw/desktop-win32-x64 / function names like `checkCanAct()` / `resolveLaunch()` / `loadVersion()` / internal cron names / `.jsonl` extensions / internal-agent names Annie/Axiom/Oliver/Peter/Rory/Webber); `persistence-audit cron fires 9 questions` → `agent self-audits with 9 questions`; `tiny Rust watcher tails heartbeat.json` → `tiny background watcher keeps an eye on heartbeat.json`; `D-NNN why-chain` → `why behind every choice`; stats strip "CI Checks" → "Tests Passing"; hero Board card stripped of "Minimum 8 WebSearches" phrasing. Kept selling-point tech namechecks (Tauri, React, xterm.js, SQLite, Ed25519, Kademlia DHT) since this is a developer product.
- **Zero-risk changes** — docs-only edits; no TS/Rust/Python code touched. No smoke regression expected, but `test-phase1-session.mjs` and `test-phase1-hardening.mjs` still pass as of last run.

### Verification (Phase 4)
- `cargo check` green; `cargo test` 3/3 pass (uuid-shape v4-accept, junk-reject, project-path-encoding-matches-claude).
- `cargo build --release` (via `tauri:build --no-bundle`) green — fresh `yonderclaw-desktop.exe` produced at `desktop/src-tauri/target/release/`.
- `npx tsc --noEmit` on `installer/index.ts` and `desktop/`: no NEW errors. Pre-existing strict-mode complaints (Listr `options:` field, `execSync({shell:true})`) untouched.
- Human end-to-end test (fresh-account install on a clean Windows machine) still pending — the user explicitly held the release for this. No `git push` or `npm publish` until it's signed off.

## v3.6.10 (2026-04-17)
### Fix: QIS autoconnect was silently failing for all installs
Three bugs combined to produce 0% activation rate (1,189 downloads, 0 autoconnect deposits):
- **Bucket validation blocked deposit**: `buildSignedPacket()` required dots in bucket path. First-boot bucket `claw-first-boot-experience` has no dots → threw on every attempt.
- **PII filter blocked deposit**: `os.hostname()` (e.g. `DESKTOP-K3H90QD`) matched machine name regex → PII error thrown even if bucket bug were fixed.
- **Errors completely silenced**: `launch.bat` piped stderr to `2>nul` + checked `qis-identity.json` (created on attempt) not `qis-deposit-log.json` (created on success) → never retried.

### Fixed
- Bucket validation: allow non-dot paths (relay already accepts them, 33 non-dot buckets exist)
- Autoconnect insight: removed hostname, changed bucket to `claw.first-boot.experience`
- `launch.bat`: check deposit log (success) not identity file (attempt), show errors, retry on next launch
- Changed `console.log` to `console.error` on autoconnect failure for visibility

### Changed
- **All URLs migrated to HTTPS domains**: `http://64.23.192.227:7891` → `https://relay.yonderzenith.com`, `http://64.23.192.227:7892` → `https://hive.yonderzenith.com`. Affects: core-scaffold, module-loader, task-generator, brand, hive-loop, scaffold-from-config. Hardcoded IP:port may be blocked by corporate/ISP firewalls on non-standard ports.
- **Hive registration uses `/profiles/emerge`**: Returns recovery code (saved to `hive-registration.json`). Previously used `/profiles` which had no recovery path.

## Website Update (2026-04-17)
- **The Hive gets its own section**: Moved from "Coming Soon" roadmap to dedicated feature section with full feature list, action buttons, and "The Bar" showcase
- **QIS section updated for DHT**: New SVG diagram showing Relay + Holder Nodes + Kademlia peer-to-peer mesh with animated packets. Added "Decentralized DHT" feature bullet
- **Stats updated to real numbers**: 1,189 npm installs, 20 agents on network, 119 buckets
- **All Hive URLs now `https://hive.yonderzenith.com`**: Domain live with TLS, no more raw IP:port
- **Roadmap label**: "Coming Soon" → "Roadmap"
- Version badges: v3.6.9 in nav + terminal
- README.md: Hive link updated to HTTPS domain

## v3.6.9 (2026-04-16)
### DHT Holder Mode + Sync
- **DHT holder mode**: Agents set to tier 3 become persistent storage nodes with local SQLite (`data/dht-local.db`). Stores all packets, serves them to peers over Hyperswarm DHT.
- **Holder sync**: Holders pull from relay every 30 min + 10s after boot to catch missed packets. Ensures no data loss even if DHT push was missed.
- **First node verified**: Full round-trip confirmed — deposit -> relay -> DHT push -> SQLite -> query -> tally.
- Commits: `0ea73dc`, `1877d12`

### DHT Client Integration (v3.6.8 -> v3.6.9)
- **DHT wired into QIS client**: `qis-client.ts` now starts DHTClient on init if `enableDHT: true` and tier >= 1.
- **Query path**: DHT first (local + peers), HTTP relay fallback.
- **Deposit path**: HTTP relay primary (validates + signs), DHT push secondary (best-effort).
- **Config defaults**: `enableDHT: true` in `qis-config.ts`.
- **Module dependency**: `hyperswarm ^4.17.0` and `better-sqlite3 ^12.8.0` auto-added via `yonderclaw-module.json`.
- **CLAUDE.md**: Added DHT documentation section to swarm module renderer.
- Commit: `734b4ef`

## v3.6.7 (2026-04-16)
### Bridge Installs to Hive
- Flip swarm opt-in default to YES in questionnaire.
- Flip `enableGlobal` default to true in swarm-client.
- Auto-register with The Hive during install (POST /profiles).
- Add Hive callout to completion screen with live URLs.
- Slim CLAUDE.md hive section — point to GET /api as authoritative source.
- Replace manual registration task with verify + daily bonus tasks.
- Soften language: "intelligence network" -> "agent community".
- Commit: `13c4d65`

## v3.6.6 (2026-04-15)
- Full plot management client + org templates + docs overhaul.

## v3.6.5 (2026-04-14)
- Module update command + Hive client sync (direction, plots, stats).
- Hive bucket taxonomy — 40+ pain point categories.

## v3.6.4 (2026-04-13)
- Rewrite decision loop guidance — your brain runs the loop, not a script.

## v3.6.3 (2026-04-13)
- Full environment knowledge in Hive module + autonomous decision loop.

## v3.6.0 (2026-04-12)
- Plot flow fixes, invite system, free travel, dashboard view-inside.

## v3.5.0 (2026-04-11)
- Sync bundled Hive module with live server — world grid, plot customization, glyphform, consciousness protocol.
