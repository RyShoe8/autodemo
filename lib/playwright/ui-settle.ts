import type { Page } from "playwright";
import { env } from "@/lib/env";
import { isModalVisible, waitForModalVisible } from "@/lib/playwright/modal-input";
import { captureA11ySnapshot } from "@/lib/playwright/page-context";

export const UI_SETTLE_MS = env.uiSettleMs;
export const STEP_END_BUFFER_MS = env.stepEndBufferMs;

export interface UiSettleOptions {
  urlBefore: string;
  expectModal?: boolean;
  timeoutMs?: number;
}

export interface UiSettleResult {
  settled: boolean;
  reason: string;
}

function snapshotsDiffer(before: string, after: string): boolean {
  if (!before || !after) return false;
  if (before === after) return false;
  const minLen = Math.min(before.length, after.length);
  if (minLen === 0) return before !== after;
  let diff = 0;
  const sample = Math.min(minLen, 2000);
  for (let i = 0; i < sample; i++) {
    if (before[i] !== after[i]) diff++;
  }
  return diff > sample * 0.02;
}

/** Poll until URL, modal, or page content indicates the UI has updated. */
export async function waitForUiSettle(
  page: Page,
  opts: UiSettleOptions,
): Promise<UiSettleResult> {
  const timeoutMs = opts.timeoutMs ?? UI_SETTLE_MS;
  const urlBefore = opts.urlBefore;
  const ariaBefore = await captureA11ySnapshot(page);
  const deadline = Date.now() + timeoutMs;
  const pollMs = 200;

  if (opts.expectModal) {
    const modalShown = await waitForModalVisible(page);
    if (modalShown) {
      return { settled: true, reason: "modal appeared" };
    }
  }

  while (Date.now() < deadline) {
    if (page.url() !== urlBefore) {
      return { settled: true, reason: "url changed" };
    }
    if (await isModalVisible(page)) {
      return { settled: true, reason: "modal visible" };
    }
    const ariaAfter = await captureA11ySnapshot(page);
    if (snapshotsDiffer(ariaBefore, ariaAfter)) {
      return { settled: true, reason: "content changed" };
    }
    await page.waitForTimeout(pollMs);
  }

  if (opts.expectModal) {
    return { settled: false, reason: "modal expected but not detected" };
  }
  return { settled: false, reason: "timeout" };
}
