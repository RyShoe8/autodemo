import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "scripts");

function loadBrowserFn(script: string): (...args: unknown[]) => unknown {
  const expr = readFileSync(join(DIR, script), "utf8").trim();
  if (expr.includes("__name")) {
    throw new Error(`Browser script ${script} contains __name`);
  }
  // Build from raw source so tsx never transforms the function body.
  const fn = new Function(`return (${expr})`)() as (...args: unknown[]) => unknown;
  if (fn.toString().includes("__name")) {
    throw new Error(`Browser script ${script} serialized with __name`);
  }
  return fn;
}

/** Run a raw browser script file via page.evaluate (bypasses tsx transforms). */
export async function browserEval<T>(
  page: Page,
  script: string,
  ...args: unknown[]
): Promise<T> {
  const fn = loadBrowserFn(script);
  return page.evaluate(fn, ...args) as Promise<T>;
}

/** Exposed for verify script — load and inspect a browser fn without Playwright. */
export function loadBrowserFnForVerify(script: string): (...args: unknown[]) => unknown {
  return loadBrowserFn(script);
}
