import type { Page } from "playwright";
import { env } from "@/lib/env";
import { isModalVisible, waitForModalVisible } from "@/lib/playwright/modal-input";
import { captureA11ySnapshot } from "@/lib/playwright/page-context";

export const UI_SETTLE_MS = env.uiSettleMs;
export const STEP_END_BUFFER_MS = env.stepEndBufferMs;

export type UiChangeExpectation = "none" | "modal" | "route" | "panel" | "text";

export interface UiSettleOptions {
  urlBefore: string;
  /** @deprecated use expectation */
  expectModal?: boolean;
  expectation?: UiChangeExpectation;
  timeoutMs?: number;
}

export interface UiSettleResult {
  settled: boolean;
  reason: string;
}

/** Candidate regions for in-panel live updates (insights sidebars, etc.). */
export const PANEL_REGION_SELECTORS = [
  '[role="complementary"]',
  '[role="main"]',
  "aside",
  '[data-panel]',
  '[class*="insight" i]',
  '[class*="panel" i]',
];

function resolveExpectation(opts: UiSettleOptions): UiChangeExpectation {
  if (opts.expectation) return opts.expectation;
  if (opts.expectModal) return "modal";
  return "none";
}

function settleTimeoutMs(
  expectation: UiChangeExpectation,
  override?: number,
): number {
  if (override !== undefined) return override;
  if (expectation === "panel" || expectation === "text") {
    return Math.max(UI_SETTLE_MS, 3000);
  }
  return UI_SETTLE_MS;
}

function snapshotsDiffer(
  before: string,
  after: string,
  threshold = 0.02,
): boolean {
  if (!before || !after) return false;
  if (before === after) return false;
  const minLen = Math.min(before.length, after.length);
  if (minLen === 0) return before !== after;
  let diff = 0;
  const sample = Math.min(minLen, 2000);
  for (let i = 0; i < sample; i++) {
    if (before[i] !== after[i]) diff++;
  }
  return diff > sample * threshold;
}

async function captureRegionSnapshot(
  page: Page,
  selector: string,
): Promise<string | null> {
  const locator = page.locator(selector).first();
  if ((await locator.count()) === 0) return null;
  try {
    const aria = await locator.ariaSnapshot();
    if (aria) return aria;
  } catch {
    /* fall through */
  }
  try {
    return await locator.innerText();
  } catch {
    return null;
  }
}

/** Snapshot all panel/main regions that exist on the page. */
async function capturePanelSnapshots(
  page: Page,
): Promise<Map<string, string>> {
  const snapshots = new Map<string, string>();
  for (const sel of PANEL_REGION_SELECTORS) {
    const snap = await captureRegionSnapshot(page, sel);
    if (snap) snapshots.set(sel, snap);
  }
  return snapshots;
}

function panelSnapshotsDiffer(
  before: Map<string, string>,
  after: Map<string, string>,
): string | null {
  for (const [sel, beforeSnap] of before) {
    const afterSnap = after.get(sel);
    if (!afterSnap) continue;
    if (snapshotsDiffer(beforeSnap, afterSnap, 0.005)) {
      return sel;
    }
  }
  for (const [sel, afterSnap] of after) {
    if (!before.has(sel) && afterSnap.length > 0) {
      return sel;
    }
  }
  return null;
}

/** Wait for a specific text string to appear in the page (e.g. after create/submit). */
export async function waitForTextAppears(
  page: Page,
  text: string,
  timeoutMs?: number,
): Promise<UiSettleResult> {
  const needle = text.trim();
  if (!needle) {
    return { settled: false, reason: "empty text needle" };
  }
  const deadline = Date.now() + (timeoutMs ?? Math.max(UI_SETTLE_MS, 3000));
  const pollMs = 250;

  while (Date.now() < deadline) {
    try {
      const bodyText = await page.locator("body").innerText();
      if (bodyText.toLowerCase().includes(needle.toLowerCase())) {
        return { settled: true, reason: `text appeared: ${needle.slice(0, 40)}` };
      }
    } catch {
      /* retry */
    }
    await page.waitForTimeout(pollMs);
  }
  return { settled: false, reason: `text not found: ${needle.slice(0, 40)}` };
}

/** Poll until URL, modal, panel region, or page content indicates the UI has updated. */
export async function waitForUiSettle(
  page: Page,
  opts: UiSettleOptions,
): Promise<UiSettleResult> {
  const expectation = resolveExpectation(opts);
  const timeoutMs = settleTimeoutMs(expectation, opts.timeoutMs);
  const urlBefore = opts.urlBefore;
  const ariaBefore = await captureA11ySnapshot(page);
  const panelBefore = await capturePanelSnapshots(page);
  const deadline = Date.now() + timeoutMs;
  const pollMs = 200;

  if (expectation === "modal") {
    const modalShown = await waitForModalVisible(page);
    if (modalShown) {
      return { settled: true, reason: "modal appeared" };
    }
  }

  while (Date.now() < deadline) {
    if (expectation === "route" && page.url() !== urlBefore) {
      return { settled: true, reason: "url changed" };
    }
    if (page.url() !== urlBefore) {
      return { settled: true, reason: "url changed" };
    }
    if (await isModalVisible(page)) {
      return { settled: true, reason: "modal visible" };
    }

    const panelAfter = await capturePanelSnapshots(page);
    const changedRegion = panelSnapshotsDiffer(panelBefore, panelAfter);
    if (changedRegion) {
      return {
        settled: true,
        reason: `panel region changed (${changedRegion})`,
      };
    }

    const ariaAfter = await captureA11ySnapshot(page);
    if (snapshotsDiffer(ariaBefore, ariaAfter)) {
      return { settled: true, reason: "content changed" };
    }
    await page.waitForTimeout(pollMs);
  }

  if (expectation === "modal") {
    return { settled: false, reason: "modal expected but not detected" };
  }
  if (expectation === "panel") {
    return { settled: false, reason: "panel update not detected" };
  }
  if (expectation === "route") {
    return { settled: false, reason: "route change not detected" };
  }
  return { settled: false, reason: "timeout" };
}
