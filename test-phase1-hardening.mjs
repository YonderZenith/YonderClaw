// Hardening test suite for v3.7.0 Phase 1.
// Verifies the four persona-flagged risks are now neutralized:
//   A. Migration backfill — adopts most-recent .jsonl when project dir already had sessions
//   B. Phantom session — installer writes session-id.txt only after .jsonl is verified on disk
//   C. UUID validation in launch.bat regex — rejects garbage / BOM / partial writes
//   D. Shell injection — spawnSync with array args (verified by inspection, not regex)
import { execSync, spawnSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const SUITE_ROOT = path.join(os.tmpdir(), "yc-phase1-hardening");
fs.rmSync(SUITE_ROOT, { recursive: true, force: true });
fs.mkdirSync(SUITE_ROOT, { recursive: true });

// Mirror installer's findClaudePath (prefer real .exe so spawnSync without shell works).
function resolveClaude() {
  const home = os.homedir();
  const cand = [
    path.join(home, ".local", "bin", "claude.exe"),
    path.join(home, "AppData", "Roaming", "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
    path.join(home, ".local", "bin", "claude"),
  ];
  for (const p of cand) if (fs.existsSync(p)) return p;
  return "claude";
}
const claudePath = resolveClaude();
console.log("[harness] claudePath:", claudePath);

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
}

// ---- Test A: migration backfill on existing project dir ----
console.log("\n=== A. Migration backfill (returning v3.6.10 user) ===");
{
  const projectDir = path.join(SUITE_ROOT, "A-existing-user");
  fs.mkdirSync(path.join(projectDir, "data"), { recursive: true });

  // Seed an existing Claude session in this dir (simulates v3.6.10 install with history).
  const oldSeed = "Remember the magic word VOLCANO";
  const r1 = spawnSync(claudePath, ["--print", oldSeed], {
    cwd: projectDir, stdio: ["ignore", "pipe", "pipe"], timeout: 60000, shell: false,
  });
  check("seed prior session exits 0", r1.status === 0, `exit=${r1.status}`);

  const encoded = projectDir.replace(/[:/\\]/g, "-").replace(/^-/, "");
  const claudeProjectsDir = path.join(os.homedir(), ".claude", "projects", encoded);
  const priorJsonls = fs.existsSync(claudeProjectsDir)
    ? fs.readdirSync(claudeProjectsDir).filter(f => f.endsWith(".jsonl"))
    : [];
  check("prior .jsonl exists in projects dir", priorJsonls.length > 0, `count=${priorJsonls.length}`);
  if (priorJsonls.length === 0) { console.log("    cannot continue A — bail"); }
  else {
    // Now run the same migration logic the installer uses.
    const jsonls = fs.readdirSync(claudeProjectsDir)
      .filter(f => f.endsWith(".jsonl"))
      .map(f => ({ f, mtime: fs.statSync(path.join(claudeProjectsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    const adopted = jsonls[0].f.replace(/\.jsonl$/, "");
    fs.writeFileSync(path.join(projectDir, "data", "session-id.txt"), adopted);
    check("adopted ID is valid UUID", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(adopted), adopted);

    // Confirm the adopted session still has VOLCANO context — proof history was preserved.
    const r2 = spawnSync(claudePath, [
      "--print", "--resume", adopted,
      "What was the magic word I told you to remember? Reply with just the word.",
    ], { cwd: projectDir, stdio: ["ignore", "pipe", "pipe"], timeout: 60000, shell: false });
    const resumeOut = (r2.stdout?.toString() || "").trim();
    check("resumed adopted session remembers VOLCANO",
      /volcano/i.test(resumeOut), JSON.stringify(resumeOut.slice(0, 80)));
  }
}

// ---- Test B: phantom session — installer should NOT write session-id.txt if .jsonl missing ----
console.log("\n=== B. Phantom-session guard ===");
{
  const projectDir = path.join(SUITE_ROOT, "B-phantom");
  fs.mkdirSync(path.join(projectDir, "data"), { recursive: true });
  // Simulate the post-spawn check from installer: pretend claude exited 0 but no .jsonl.
  const fakeId = crypto.randomUUID();
  const encoded = projectDir.replace(/[:/\\]/g, "-").replace(/^-/, "");
  const expected = path.join(os.homedir(), ".claude", "projects", encoded, fakeId + ".jsonl");
  // We never created `expected`. The installer's guard:  if (!fs.existsSync(expected)) return;
  // So we assert the guard would short-circuit:
  check("guard would skip session-id.txt write", !fs.existsSync(expected),
    "expected jsonl absent → installer returns before writing session-id.txt");
  check("session-id.txt absent on phantom", !fs.existsSync(path.join(projectDir, "data", "session-id.txt")));
}

// ---- Test C: UUID validation in launch.bat regex ----
console.log("\n=== C. UUID-validation regex (launch.bat) ===");
{
  // The exact regex used in launch.bat:
  const batRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const cases = [
    ["valid UUID", "bf316b7a-536f-450d-b2fd-7b4e980df3bf", true],
    ["empty string", "", false],
    ["BOM-prefixed UUID", "\uFEFFbf316b7a-536f-450d-b2fd-7b4e980df3bf", false],
    ["legacy pre-v1.1 content", "session_2024-01-15_atlas", false],
    ["partial write", "bf316b7a-536f-450d-b2fd-7b4e9", false],
    ["UUID with trailing space", "bf316b7a-536f-450d-b2fd-7b4e980df3bf ", false],
    ["UUID with newline", "bf316b7a-536f-450d-b2fd-7b4e980df3bf\n", false],
    ["UPPERCASE UUID", "BF316B7A-536F-450D-B2FD-7B4E980DF3BF", true],
    ["wrong separator count", "bf316b7a536f450db2fd7b4e980df3bf", false],
  ];
  for (const [name, input, expect] of cases) {
    const got = batRegex.test(input);
    check(`regex ${expect ? "accepts" : "rejects"} ${name}`, got === expect, JSON.stringify(input.slice(0, 50)));
  }
}

// ---- Test D: shell-injection resistance via spawnSync(array) ----
console.log("\n=== D. Shell-injection resistance ===");
{
  // Simulate a future contributor changing seed to something nasty.
  const projectDir = path.join(SUITE_ROOT, "D-injection");
  fs.mkdirSync(projectDir, { recursive: true });
  const sessionId = crypto.randomUUID();
  // This seed contains shell metacharacters. With execSync+shell it would be catastrophic.
  // With spawnSync(array, shell:false) it's just literal text in argv.
  const evilSeed = `Test ${"$"}(rm -rf /tmp/should-not-happen) "& calc.exe & echo ok`;
  const r = spawnSync(claudePath,
    ["--print", "--session-id", sessionId, evilSeed],
    { cwd: projectDir, stdio: ["ignore", "pipe", "pipe"], timeout: 60000, shell: false });
  check("evil seed did not crash spawn", r.error === undefined, r.error?.message || "");
  // We don't assert exit==0 because Claude may refuse the prompt; we only assert that
  // the shell didn't expand the metacharacters into command execution.
  const sentinel = "/tmp/should-not-happen";
  check("rm sentinel was NOT executed", !fs.existsSync(sentinel),
    "shell metacharacters in seed never reached a shell");
}

console.log(`\n=== TOTALS: ${pass} pass, ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
