import {
  crawlNavigationFallback,
  crawlNavigationPrimary,
  extractInteractivesInBrowser,
  extractVisibleTextInBrowser,
} from "../lib/playwright/browser-eval/discovery.browser.js";

const fns = [
  ["crawlNavigationPrimary", crawlNavigationPrimary],
  ["crawlNavigationFallback", crawlNavigationFallback],
  ["extractInteractivesInBrowser", extractInteractivesInBrowser],
  ["extractVisibleTextInBrowser", extractVisibleTextInBrowser],
];

for (const [name, fn] of fns) {
  const src = fn.toString();
  if (src.includes("__name")) {
    console.error(`${name} contains __name — unsafe for page.evaluate`);
    process.exit(1);
  }
}

console.log(`Verified ${fns.length} browser-eval functions (no __name).`);
