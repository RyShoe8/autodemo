import type { Page } from "playwright";
import { recordViewport } from "@/lib/playwright/browser";

const MAX_A11Y_CHARS = 8000;

/** Capture a truncated accessibility tree snapshot for AI resolution. */
export async function captureA11ySnapshot(page: Page): Promise<string> {
  try {
    const snapshot = await page.locator("body").ariaSnapshot();
    if (!snapshot) return "";
    return snapshot.length > MAX_A11Y_CHARS
      ? `${snapshot.slice(0, MAX_A11Y_CHARS)}\n…(truncated)`
      : snapshot;
  } catch {
    return "";
  }
}

/** Capture a JPEG viewport screenshot for vision fallback (keeps payload small). */
export async function captureStepScreenshot(page: Page): Promise<Buffer> {
  const viewport = recordViewport();
  return page.screenshot({
    fullPage: false,
    type: "jpeg",
    quality: 72,
    clip: {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
    },
  });
}
