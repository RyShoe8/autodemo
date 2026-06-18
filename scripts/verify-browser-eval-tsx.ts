import { loadBrowserFnForVerify } from "../lib/playwright/browser-eval/run";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../lib/playwright/browser-eval/scripts",
);

const files = readdirSync(scriptsDir).filter((f) => f.endsWith(".fn.js"));

for (const file of files) {
  const fn = loadBrowserFnForVerify(file);
  if (fn.toString().includes("__name")) {
    console.error(`${file}: tsx load path contains __name`);
    process.exit(1);
  }
}

console.log(`tsx load path OK for ${files.length} browser-eval scripts.`);
