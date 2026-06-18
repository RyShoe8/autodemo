import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDir = join(root, "lib/playwright/browser-eval/scripts");

const files = readdirSync(scriptsDir).filter((f) => f.endsWith(".fn.js"));

for (const file of files) {
  const raw = readFileSync(join(scriptsDir, file), "utf8");
  if (raw.includes("__name")) {
    console.error(`${file}: raw source contains __name`);
    process.exit(1);
  }

  const fn = new Function(`return (${raw.trim()})`)();
  if (fn.toString().includes("__name")) {
    console.error(`${file}: serialized function contains __name`);
    process.exit(1);
  }
}

const tsxCheck = spawnSync("npx", ["tsx", "scripts/verify-browser-eval-tsx.ts"], {
  shell: true,
  stdio: "inherit",
  cwd: root,
});

if (tsxCheck.status !== 0) {
  process.exit(tsxCheck.status ?? 1);
}

console.log(`Verified ${files.length} browser-eval scripts (raw + tsx load path).`);
