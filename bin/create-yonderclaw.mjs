#!/usr/bin/env node
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const entry = join(root, "installer", "index.ts");

// Find tsx binary — check own node_modules, parent (npm flattened), and up
const search = [
  join(root, "node_modules", ".bin"),
  join(root, "..", ".bin"),
  join(root, "..", "..", ".bin"),
];

let tsxBin = null;
for (const dir of search) {
  const cmd = join(dir, process.platform === "win32" ? "tsx.cmd" : "tsx");
  if (existsSync(cmd)) { tsxBin = cmd; break; }
}

if (!tsxBin) {
  // Last resort: try npx cache location
  const npxCache = join(root, "..", "..", "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  if (existsSync(npxCache)) tsxBin = npxCache;
}

if (!tsxBin) {
  console.error("Error: Could not find tsx. Install YonderClaw via: git clone + npm install + npm start");
  process.exit(1);
}

try {
  execFileSync(tsxBin, [entry], {
    stdio: "inherit",
    cwd: root,
    shell: tsxBin.endsWith(".cmd"),
  });
} catch (e) {
  process.exit(e.status || 1);
}
