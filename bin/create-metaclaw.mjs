#!/usr/bin/env node
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const entry = join(root, "installer", "index.ts");

// Find tsx - check .bin for both unix and windows
const candidates = [
  join(root, "node_modules", ".bin", "tsx.cmd"),
  join(root, "node_modules", ".bin", "tsx"),
  "tsx",
];

let tsx = candidates.find((c) => c === "tsx" || existsSync(c)) || "tsx";

try {
  execFileSync(tsx, [entry], { stdio: "inherit", cwd: root, shell: tsx.endsWith(".cmd") });
} catch (e) {
  process.exit(e.status || 1);
}
