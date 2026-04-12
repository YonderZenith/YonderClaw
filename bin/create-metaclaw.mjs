#!/usr/bin/env node
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = join(__dirname, "..", "installer", "index.ts");

// Use tsx's programmatic API — works regardless of where .bin lands
import("tsx/esm/api").then(({ register }) => {
  register();
  import(new URL(`file://${entry.replace(/\\/g, "/")}`).href);
}).catch(() => {
  // Fallback: spawn tsx as a child process
  import("child_process").then(({ execFileSync }) => {
    import("fs").then(({ existsSync }) => {
      const root = join(__dirname, "..");
      const places = [
        join(root, "node_modules", ".bin", "tsx.cmd"),
        join(root, "node_modules", ".bin", "tsx"),
        join(root, "..", ".bin", "tsx.cmd"),
        join(root, "..", ".bin", "tsx"),
      ];
      const tsx = places.find(p => existsSync(p)) || "tsx";
      try {
        execFileSync(tsx, [entry], { stdio: "inherit", cwd: root, shell: tsx.endsWith(".cmd") });
      } catch (e) {
        console.error("Failed to start MetaClaw. Make sure tsx is installed: npm install -g tsx");
        process.exit(1);
      }
    });
  });
});
