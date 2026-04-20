// End-to-end harness for v3.7.0 Phase 1: install-time session capture + launch.bat resume.
// Mirrors the new Listr task in installer/index.ts and the new launch.bat priority logic,
// then verifies session continuity by resuming the captured ID with a follow-up prompt.
import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TEST_DIR = path.join(os.tmpdir(), "yc-phase1-test");
fs.rmSync(TEST_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(TEST_DIR, "data"), { recursive: true });

const claudePath =
  fs.existsSync(path.join(os.homedir(), ".local", "bin", "claude.exe"))
    ? path.join(os.homedir(), ".local", "bin", "claude.exe")
    : "claude";

console.log("[harness] claude:", claudePath);
console.log("[harness] cwd   :", TEST_DIR);

// === STEP 1: simulate the installer's session-capture task ===
const sessionId = crypto.randomUUID();
const seed = "Reply with exactly the word: ready";
console.log("\n[step 1] generated session-id:", sessionId);

let seedReply;
try {
  seedReply = execSync(
    `"${claudePath}" --print --session-id ${sessionId} "${seed}"`,
    { cwd: TEST_DIR, stdio: ["ignore", "pipe", "pipe"], timeout: 60000 }
  ).toString().trim();
  console.log("[step 1] seed reply:", JSON.stringify(seedReply));
} catch (e) {
  console.error("[step 1] FAIL:", e.message);
  process.exit(1);
}

// === STEP 2: write session-id.json + session-id.txt as the installer would ===
fs.writeFileSync(
  path.join(TEST_DIR, "data", "session-id.json"),
  JSON.stringify({
    session_id: sessionId,
    created_at: new Date().toISOString(),
    seed_prompt: seed,
    source: "installer-v3.7.0",
  }, null, 2)
);
fs.writeFileSync(path.join(TEST_DIR, "data", "session-id.txt"), sessionId);
console.log("[step 2] wrote session-id.{json,txt}");

// === STEP 3: verify .jsonl landed in encoded path Claude uses ===
const encoded = TEST_DIR.replace(/[:/\\]/g, "-").replace(/^-/, "");
const sessionFile = path.join(os.homedir(), ".claude", "projects", encoded, sessionId + ".jsonl");
console.log("[step 3] expecting:", sessionFile);
if (!fs.existsSync(sessionFile)) {
  console.error("[step 3] FAIL: jsonl not found");
  process.exit(2);
}
console.log("[step 3] OK — jsonl exists, size:", fs.statSync(sessionFile).size);

// === STEP 4: simulate the launch.bat priority — read session-id.txt, --resume <id> ===
const readId = fs.readFileSync(path.join(TEST_DIR, "data", "session-id.txt"), "utf8").trim();
if (readId !== sessionId) {
  console.error("[step 4] FAIL: id round-trip mismatch", { readId, sessionId });
  process.exit(3);
}
console.log("[step 4] launch.bat would resume:", readId);

// === STEP 5: actually resume the session and confirm context survived ===
let resumeReply;
try {
  resumeReply = execSync(
    `"${claudePath}" --print --resume ${sessionId} "What word did I just ask you to reply with? Answer with only that word."`,
    { cwd: TEST_DIR, stdio: ["ignore", "pipe", "pipe"], timeout: 60000 }
  ).toString().trim();
  console.log("[step 5] resume reply:", JSON.stringify(resumeReply));
} catch (e) {
  console.error("[step 5] FAIL:", e.message);
  process.exit(4);
}

// === STEP 6: assert continuity — model should remember "ready" was the seed word ===
if (!/ready/i.test(resumeReply)) {
  console.error("[step 6] FAIL: resumed session did not remember seed prompt context");
  process.exit(5);
}
console.log("[step 6] OK — session continuity verified across --print --resume");

console.log("\n[ALL PASS] Phase 1 end-to-end: capture → write → resume → context survives");
