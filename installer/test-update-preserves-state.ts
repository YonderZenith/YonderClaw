/**
 * Preserve-on-update test.
 *
 * Seeds a throwaway "installed agent" with known-unique content in every
 * protected location, re-runs the module-loader with preserve=true against
 * the real core module, and asserts that:
 *   - every data/*, memory/*, .env, *.db, CLAUDE.md file is byte-identical
 *   - at least one non-protected code file (src/db.ts) was overwritten
 *   - the tally reports the right counts
 *   - isProtectedPath() classifies edge cases correctly
 *
 * Run from the repo root:   npx tsx installer/test-update-preserves-state.ts
 * Exit code 0 = pass, 1 = fail.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import {
  discoverModules,
  buildPlaceholders,
  processModuleContributes,
  isProtectedPath,
  type InstallConfig,
} from "./module-loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODULES_DIR = path.join(__dirname, "modules");

type Check = { name: string; pass: boolean; detail?: string };
const checks: Check[] = [];
function assert(name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, detail });
}

// ---------- 1. Unit checks on isProtectedPath (no filesystem) ----------
assert("isProtectedPath('data/state.json')", isProtectedPath("data/state.json") === true);
assert("isProtectedPath('data/logs/foo.jsonl')", isProtectedPath("data/logs/foo.jsonl") === true);
assert("isProtectedPath('memory/SOUL.md')", isProtectedPath("memory/SOUL.md") === true);
assert("isProtectedPath('memory/capabilities/_auto.md')", isProtectedPath("memory/capabilities/_auto.md") === true);
assert("isProtectedPath('.env')", isProtectedPath(".env") === true);
assert("isProtectedPath('.env.local')", isProtectedPath(".env.local") === true);
assert("isProtectedPath('CLAUDE.md')", isProtectedPath("CLAUDE.md") === true);
assert("isProtectedPath('hive.db')", isProtectedPath("hive.db") === true);
assert("isProtectedPath('data/hive.db-wal')", isProtectedPath("data/hive.db-wal") === true);
assert("isProtectedPath('src/db.ts') == false", isProtectedPath("src/db.ts") === false);
assert("isProtectedPath('src/nested/file.ts') == false", isProtectedPath("src/nested/file.ts") === false);
assert("isProtectedPath('package.json') == false", isProtectedPath("package.json") === false);
assert("isProtectedPath('SOUL.md') == false", isProtectedPath("SOUL.md") === false);

// ---------- 2. Integration check: seed, update, verify ----------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yc-update-test-"));
let cleanup = true;

const UNIQUE = {
  stateJson: `{"__SENTINEL__":"AGENT_LIVES_HERE","next_priority_action":"survive the update"}`,
  tasksJson: `{"__SENTINEL__":"TASKS_SURVIVED","hts":[],"ats":[]}`,
  roadmapMd: `# SENTINEL_ROADMAP\nThis must survive the update.`,
  soulMd: `# Agent Soul — SENTINEL_SOUL\n10 unique principles that must not be overwritten.`,
  journeyMd: `# Journey Log — SENTINEL_JOURNEY\nI was born, I lived, I survived an update.`,
  logicLog: `{"ts":"2026-04-19T00:00:00Z","decision_id":"D-SENTINEL","reasoning":"must survive"}\n`,
  envFile: `ANTHROPIC_API_KEY=sk-sentinel-must-survive\n`,
  staleCode: `// STALE_CODE_MARKER — must be overwritten\nexport const stale = true;\n`,
};

try {
  fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "data", "logs"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "memory"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "memory", "capabilities"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });

  fs.writeFileSync(path.join(tmpDir, "data", "state.json"), UNIQUE.stateJson);
  fs.writeFileSync(path.join(tmpDir, "data", "tasks.json"), UNIQUE.tasksJson);
  fs.writeFileSync(path.join(tmpDir, "data", "ROADMAP.md"), UNIQUE.roadmapMd);
  fs.writeFileSync(path.join(tmpDir, "memory", "SOUL.md"), UNIQUE.soulMd);
  fs.writeFileSync(path.join(tmpDir, "memory", "journey_log.md"), UNIQUE.journeyMd);
  fs.writeFileSync(path.join(tmpDir, "memory", "logic-log.jsonl"), UNIQUE.logicLog);
  fs.writeFileSync(path.join(tmpDir, ".env"), UNIQUE.envFile);
  fs.writeFileSync(path.join(tmpDir, "src", "db.ts"), UNIQUE.staleCode);

  const allModules = discoverModules(MODULES_DIR);
  const core = allModules.find(m => m.manifest.name === "core");
  if (!core) throw new Error("core module not found at " + MODULES_DIR);

  const config: InstallConfig = { clawType: "custom", agentName: "Sentinel" };
  const placeholders = buildPlaceholders(config, tmpDir);
  const tally = { written: [] as string[], preserved: [] as string[], missing: [] as string[] };

  processModuleContributes(core, tmpDir, placeholders, { preserve: true, tally });

  const readBack = (rel: string) => fs.readFileSync(path.join(tmpDir, rel), "utf-8");

  assert("data/state.json preserved byte-exact",           readBack("data/state.json") === UNIQUE.stateJson);
  assert("data/tasks.json preserved byte-exact",           readBack("data/tasks.json") === UNIQUE.tasksJson);
  assert("data/ROADMAP.md preserved byte-exact",           readBack("data/ROADMAP.md") === UNIQUE.roadmapMd);
  assert("memory/SOUL.md preserved byte-exact",            readBack("memory/SOUL.md") === UNIQUE.soulMd);
  assert("memory/journey_log.md preserved byte-exact",     readBack("memory/journey_log.md") === UNIQUE.journeyMd);
  assert("memory/logic-log.jsonl preserved byte-exact",    readBack("memory/logic-log.jsonl") === UNIQUE.logicLog);
  assert(".env preserved byte-exact",                      readBack(".env") === UNIQUE.envFile);

  const newDbTs = readBack("src/db.ts");
  assert("src/db.ts was overwritten (no STALE_CODE_MARKER)", !newDbTs.includes("STALE_CODE_MARKER"));
  assert("src/db.ts has fresh content (non-empty)",          newDbTs.length > 0);

  // Files that didn't exist before should now exist (fresh seed)
  const newlyCreated = [
    "src/safety.ts", "src/observability.ts", "src/health-check.ts",
    "data/system-context.json", "data/DEPLOYED.json",
    "memory/CAPABILITIES.md", "memory/stuck-patterns.md", "memory/curiosity.md",
  ];
  for (const rel of newlyCreated) {
    assert(`${rel} was seeded (didn't exist before)`, fs.existsSync(path.join(tmpDir, rel)));
  }

  // Tally sanity — the core module contributes exactly these four protected files
  // that we also pre-seeded: state.json, ROADMAP.md, SOUL.md, logic-log.jsonl.
  // The other seeded files (tasks.json, journey_log.md, .env) are NOT in core's
  // contributes, so they're preserved by never being a write candidate in the
  // first place — not by the tally. Their byte-exact checks above cover them.
  const preservedCount = tally.preserved.length;
  const writtenCount = tally.written.length;
  assert(
    `tally.preserved >= 4 (got ${preservedCount})`,
    preservedCount >= 4,
    `preserved: ${tally.preserved.map(p => path.relative(tmpDir, p)).join(", ")}`,
  );
  assert(
    `tally.written >= 5 (got ${writtenCount})`,
    writtenCount >= 5,
  );

  // Every path in tally.preserved should be one of the files we seeded that core
  // actually tries to contribute (the subset where pre-existing file meets module manifest).
  const seeded = new Set([
    path.join(tmpDir, "data", "state.json"),
    path.join(tmpDir, "data", "ROADMAP.md"),
    path.join(tmpDir, "memory", "SOUL.md"),
    path.join(tmpDir, "memory", "logic-log.jsonl"),
  ]);
  for (const p of tally.preserved) {
    assert(`tally.preserved path is a seeded file: ${path.relative(tmpDir, p)}`, seeded.has(p));
  }

  // No preserved path should also appear in written (mutual exclusion)
  const writtenSet = new Set(tally.written);
  const overlap = tally.preserved.filter(p => writtenSet.has(p));
  assert("no path appears in both preserved and written", overlap.length === 0);

} catch (err) {
  assert("integration test threw", false, String(err));
  cleanup = false; // keep tmpDir for inspection
} finally {
  if (cleanup) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  } else {
    console.error(`\n  Test failed — tmp dir kept for inspection: ${tmpDir}\n`);
  }
}

// ---------- 3. Nested-project false-positive check ----------
// A project that happens to sit inside a parent folder named `data` or `memory`
// must NOT have its src files misclassified as protected.
const nestedParent = fs.mkdtempSync(path.join(os.tmpdir(), "yc-nested-"));
const nestedProjectDir = path.join(nestedParent, "data", "MyAgent");
let nestedCleanup = true;
try {
  fs.mkdirSync(path.join(nestedProjectDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(nestedProjectDir, "data"), { recursive: true });
  fs.writeFileSync(path.join(nestedProjectDir, "src", "db.ts"), "// STALE_NESTED\n");
  fs.writeFileSync(path.join(nestedProjectDir, "data", "state.json"), `{"nested":"SURVIVE"}`);

  const allModules = discoverModules(MODULES_DIR);
  const core = allModules.find(m => m.manifest.name === "core")!;
  const placeholders = buildPlaceholders({ clawType: "custom", agentName: "Nested" }, nestedProjectDir);
  const tally = { written: [] as string[], preserved: [] as string[], missing: [] as string[] };
  processModuleContributes(core, nestedProjectDir, placeholders, { preserve: true, tally });

  const dbTs = fs.readFileSync(path.join(nestedProjectDir, "src", "db.ts"), "utf-8");
  assert("nested project: src/db.ts still overwrites (not mis-protected by outer 'data/')", !dbTs.includes("STALE_NESTED"));
  assert("nested project: data/state.json still preserved", fs.readFileSync(path.join(nestedProjectDir, "data", "state.json"), "utf-8") === `{"nested":"SURVIVE"}`);
} catch (err) {
  assert("nested-project test threw", false, String(err));
  nestedCleanup = false;
} finally {
  if (nestedCleanup) {
    try { fs.rmSync(nestedParent, { recursive: true, force: true }); } catch {}
  } else {
    console.error(`\n  Nested test failed — kept for inspection: ${nestedParent}\n`);
  }
}

// ---------- 4. Full updateModules subprocess check ----------
// Spawns the actual installer with `--update-modules <tmp>` so a regression in the
// end-to-end flow (not just `processModuleContributes`) gets caught. This is the
// one that would have caught the CLAUDE.md duplication bug.
import { spawnSync } from "child_process";
const endToEndDir = fs.mkdtempSync(path.join(os.tmpdir(), "yc-e2e-"));
let endToEndCleanup = true;
try {
  fs.mkdirSync(path.join(endToEndDir, "data"), { recursive: true });
  fs.mkdirSync(path.join(endToEndDir, "memory"), { recursive: true });
  fs.mkdirSync(path.join(endToEndDir, "src"), { recursive: true });

  // Minimal package.json + modules.json so updateModules validates + finds something to update
  fs.writeFileSync(path.join(endToEndDir, "package.json"), JSON.stringify({
    name: "yc-e2e-test",
    version: "0.0.1",
    type: "module",
    scripts: {},
    dependencies: {},
    yonderclaw: { clawType: "custom", agentName: "E2E" },
  }, null, 2));
  fs.writeFileSync(path.join(endToEndDir, "data", "modules.json"), JSON.stringify({
    yonderclawVersion: "3.6.0",
    installedAt: new Date().toISOString(),
    modules: [{ name: "core", displayName: "Core", version: "3.6.0", category: "foundation", installedAt: new Date().toISOString() }],
  }, null, 2));

  const claudeMdSentinel = "# E2E CLAUDE.md\n\nOperator's hand-edited content — must survive update.\n";
  fs.writeFileSync(path.join(endToEndDir, "CLAUDE.md"), claudeMdSentinel);
  fs.writeFileSync(path.join(endToEndDir, "data", "state.json"), `{"e2e":"SURVIVE"}`);
  fs.writeFileSync(path.join(endToEndDir, "memory", "SOUL.md"), "# SOUL_E2E_SENTINEL\n");
  fs.writeFileSync(path.join(endToEndDir, ".env"), "ANTHROPIC_API_KEY=sk-e2e-sentinel\n");
  fs.writeFileSync(path.join(endToEndDir, "src", "db.ts"), "// STALE_E2E_MARKER\n");

  const installerEntry = path.join(__dirname, "index.ts");
  const proc = spawnSync("npx", ["tsx", installerEntry, "--update-modules", endToEndDir], {
    encoding: "utf-8",
    shell: process.platform === "win32",
    timeout: 60_000,
  });

  assert(`updateModules exited 0 (got ${proc.status})`, proc.status === 0, `stderr: ${proc.stderr?.slice(0, 400)}`);
  if (process.env.TEST_UPDATE_DEBUG) {
    console.log("----- installer stdout -----\n" + proc.stdout);
    console.log("----- installer stderr -----\n" + proc.stderr);
  }

  const claudeAfter = fs.readFileSync(path.join(endToEndDir, "CLAUDE.md"), "utf-8");
  assert("e2e: CLAUDE.md byte-identical (no duplication / no clobber)", claudeAfter === claudeMdSentinel);
  assert("e2e: data/state.json still SURVIVE", fs.readFileSync(path.join(endToEndDir, "data", "state.json"), "utf-8") === `{"e2e":"SURVIVE"}`);
  assert("e2e: memory/SOUL.md sentinel survived", fs.readFileSync(path.join(endToEndDir, "memory", "SOUL.md"), "utf-8").includes("SOUL_E2E_SENTINEL"));
  assert("e2e: .env survived", fs.readFileSync(path.join(endToEndDir, ".env"), "utf-8").includes("sk-e2e-sentinel"));
  const dbAfter = fs.readFileSync(path.join(endToEndDir, "src", "db.ts"), "utf-8");
  assert("e2e: src/db.ts was rewritten (no STALE_E2E_MARKER)", !dbAfter.includes("STALE_E2E_MARKER"));
  assert("e2e: UPGRADE-NOTES.md was written", fs.existsSync(path.join(endToEndDir, "UPGRADE-NOTES.md")));
  assert("e2e: .upgrade-pending.json flag was written", fs.existsSync(path.join(endToEndDir, "data", ".upgrade-pending.json")));
} catch (err) {
  assert("e2e test threw", false, String(err));
  endToEndCleanup = false;
} finally {
  if (endToEndCleanup) {
    try { fs.rmSync(endToEndDir, { recursive: true, force: true }); } catch {}
  } else {
    console.error(`\n  E2E test failed — kept for inspection: ${endToEndDir}\n`);
  }
}

// ---------- 5. Report ----------
const failed = checks.filter(c => !c.pass);
const passed = checks.length - failed.length;
console.log(`\n  preserve-on-update test`);
console.log(`  ${"─".repeat(40)}`);
for (const c of checks) {
  const mark = c.pass ? "✓" : "✗";
  console.log(`  ${mark} ${c.name}`);
  if (!c.pass && c.detail) console.log(`      ${c.detail}`);
}
console.log(`\n  ${passed}/${checks.length} checks passed`);

if (failed.length > 0) {
  process.exit(1);
}
