import type { Page } from "playwright";

const MODAL_INPUT_SELECTORS = [
  '[role="dialog"] input:not([type="hidden"])',
  '[role="dialog"] textarea',
  '[role="dialog"] [contenteditable="true"]',
  '[role="textbox"]',
  'input:not([type="hidden"]):visible',
  "textarea:visible",
  '[contenteditable="true"]:visible',
];

/** Wait for a modal or inline input to appear (common after click steps). */
export async function waitForModalInput(page: Page): Promise<void> {
  for (const sel of MODAL_INPUT_SELECTORS) {
    try {
      await page.locator(sel).first().waitFor({ state: "visible", timeout: 5000 });
      return;
    } catch {
      /* try next */
    }
  }
}
