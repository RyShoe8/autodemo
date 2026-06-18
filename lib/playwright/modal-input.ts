import type { Page } from "playwright";

/** Selectors for open dialogs / overlays (Radix, shadcn, native). */
export const MODAL_VISIBLE_SELECTORS = [
  '[role="dialog"]:visible',
  '[role="alertdialog"]:visible',
  '[data-state="open"][role="dialog"]',
  '[data-state="open"][role="alertdialog"]',
  '[data-state="open"]:has([role="dialog"])',
];

export const MODAL_INPUT_SELECTORS = [
  '[role="dialog"] input:not([type="hidden"])',
  '[role="dialog"] textarea',
  '[role="dialog"] [contenteditable="true"]',
  '[role="alertdialog"] input:not([type="hidden"])',
  '[role="alertdialog"] textarea',
  '[role="textbox"]',
  'input:not([type="hidden"]):visible',
  "textarea:visible",
  '[contenteditable="true"]:visible',
];

/** Returns true if any modal/overlay selector matches a visible element. */
export async function isModalVisible(page: Page): Promise<boolean> {
  for (const sel of MODAL_VISIBLE_SELECTORS) {
    if ((await page.locator(sel).count()) > 0) return true;
  }
  return false;
}

/** Wait for a modal or overlay to appear (common after click steps). */
export async function waitForModalVisible(page: Page): Promise<boolean> {
  for (const sel of MODAL_VISIBLE_SELECTORS) {
    try {
      await page.locator(sel).first().waitFor({ state: "visible", timeout: 5000 });
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

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
