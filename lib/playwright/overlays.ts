import type { Page } from "playwright";

const DISMISS_PATTERN = /accept|agree|close|dismiss|got it|allow|ok/i;

/**
 * Try to dismiss common cookie banners and modal overlays.
 * Best-effort — failures are ignored so any site can proceed.
 */
export async function dismissOverlays(page: Page): Promise<void> {
  try {
    const buttons = page.getByRole("button", { name: DISMISS_PATTERN });
    const count = await buttons.count();
    for (let i = 0; i < Math.min(count, 3); i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(300);
      }
    }
  } catch {
    /* ignore */
  }
}
