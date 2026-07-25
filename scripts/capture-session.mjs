#!/usr/bin/env node
/**
 * Capture an authenticated browser session for AutoDemo.
 *
 * Opens a real (headed) Chromium window on YOUR machine. You log in by hand —
 * including MFA, SSO, or CAPTCHA, which the automated pipeline cannot do —
 * then press Enter here. The session (cookies + localStorage) is written to
 * storage-state.json. Upload it on the project's Edit page under
 * "Browser session", and the worker will reuse it instead of logging in.
 *
 * Usage:
 *   node scripts/capture-session.mjs https://yourapp.example.com
 *   node scripts/capture-session.mjs https://yourapp.example.com out.json
 */
import { createInterface } from "node:readline";
import { chromium } from "playwright";

const url = process.argv[2];
const outFile = process.argv[3] ?? "storage-state.json";

if (!url) {
  console.error("Usage: node scripts/capture-session.mjs <app-url> [out-file]");
  process.exit(1);
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(url);

console.log("");
console.log("A browser window is open. Log in to the application there");
console.log("(complete any MFA / SSO / CAPTCHA steps as needed).");
console.log("");

await new Promise((resolve) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.question("When you are fully logged in, press Enter here... ", () => {
    rl.close();
    resolve();
  });
});

const state = await context.storageState({ path: outFile });
await browser.close();

console.log("");
console.log(`Saved ${state.cookies.length} cookies to ${outFile}.`);
console.log("Next: open the project's Edit page in AutoDemo and paste the");
console.log(`contents of ${outFile} into the "Browser session" section.`);
