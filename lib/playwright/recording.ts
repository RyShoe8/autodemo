import type { Browser, Page } from "playwright";
import { isBlobStorageError } from "@/lib/storage/blob-utils";
import { storage } from "@/lib/storage";
import { placeholderScreenshotSVG } from "@/lib/media/placeholder";
import { login } from "@/lib/playwright/discovery";
import { navigateAndWait, waitForAppReady } from "@/lib/playwright/spa";
import {
  clickResolved,
  highlightResolved,
  resolveStep,
  typeResolved,
} from "@/lib/playwright/step-resolver";
import type { Reporter } from "@/lib/workflow/context";
import type {
  ApplicationMap,
  CapturedScene,
  RecordingResult,
  WorkflowStep,
} from "@/types";

export interface RecordOptions {
  projectId: string;
  url: string;
  email: string;
  password: string;
  workflow: WorkflowStep[];
  applicationMap?: ApplicationMap;
  reporter: Reporter;
}

function estimateDuration(step: WorkflowStep): number {
  const base = 4;
  const extra = Math.min(4, Math.round((step.description?.length ?? 0) / 60));
  return base + extra;
}

async function waitForSpaUpdate(page: Page, urlBefore: string): Promise<void> {
  await waitForAppReady(page);
  if (page.url() === urlBefore) {
    await page.waitForTimeout(800);
  }
}

/** Execute a single workflow step against the live page. */
export async function captureStep(
  page: Page,
  step: WorkflowStep,
  origin: string,
  reporter: Reporter,
  applicationMap?: ApplicationMap,
): Promise<void> {
  const resolved = resolveStep(step, applicationMap);
  const urlBefore = page.url();

  try {
    switch (step.actionType) {
      case "navigate": {
        const target = resolved.url
          ? new URL(resolved.url, origin).toString()
          : origin;
        await navigateAndWait(page, target);
        break;
      }
      case "click": {
        const result = await clickResolved(page, resolved, step, applicationMap);
        if (!result.success) {
          await reporter.log(
            `Step "${step.title}": no click target found — skipping interaction.`,
          );
        } else {
          await reporter.log(
            `Step "${step.title}": click via ${result.strategy}.`,
          );
          await page.waitForLoadState("networkidle").catch(() => {});
          await waitForSpaUpdate(page, urlBefore);
        }
        break;
      }
      case "type": {
        const result = await typeResolved(page, resolved, step);
        if (!result.success) {
          await reporter.log(
            `Step "${step.title}": no input field found — skipping type.`,
          );
        } else {
          await reporter.log(
            `Step "${step.title}": type via ${result.strategy}.`,
          );
          await waitForSpaUpdate(page, urlBefore);
        }
        break;
      }
      case "scroll": {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
        break;
      }
      case "highlight": {
        const result = await highlightResolved(
          page,
          resolved,
          step,
          applicationMap,
        );
        if (result.success && result.strategy) {
          await reporter.log(
            `Step "${step.title}": highlight via ${result.strategy}.`,
          );
        }
        break;
      }
      case "wait": {
        await page.waitForTimeout(800);
        break;
      }
      case "screenshot":
      default:
        break;
    }
    await page.waitForTimeout(1200);
  } catch (err) {
    await reporter.log(
      `Step "${step.title}" action issue: ${err instanceof Error ? err.message : String(err)} (captured current state).`,
    );
  }
}

/** Capture a scene (screenshot) for a step and persist it. */
export async function recordScene(
  page: Page,
  step: WorkflowStep,
  projectId: string,
  order: number,
): Promise<CapturedScene> {
  const buffer = await page.screenshot({ fullPage: false });
  const { url } = await storage.save(
    `projects/${projectId}/scenes/scene-${order}.png`,
    buffer,
    "image/png",
  );
  return {
    stepId: step.id,
    title: step.title,
    screenshot: url,
    durationSeconds: estimateDuration(step),
  };
}

async function buildMockScenes(
  opts: RecordOptions,
  enabledSteps: WorkflowStep[],
): Promise<CapturedScene[]> {
  const mapShots = opts.applicationMap?.screenshots ?? [];
  const scenes: CapturedScene[] = [];
  for (let i = 0; i < enabledSteps.length; i++) {
    const step = enabledSteps[i];
    let screenshot = mapShots[i % Math.max(1, mapShots.length)];
    if (!screenshot) {
      const svg = placeholderScreenshotSVG({
        title: step.title,
        subtitle: step.description,
        index: i,
      });
      const { url } = await storage.save(
        `projects/${opts.projectId}/scenes/scene-${i}.svg`,
        svg,
        "image/svg+xml",
      );
      screenshot = url;
    }
    scenes.push({
      stepId: step.id,
      title: step.title,
      screenshot,
      durationSeconds: estimateDuration(step),
    });
  }
  return scenes;
}

/**
 * Execute the approved workflow against the live application, capturing a scene
 * per enabled step. Falls back to discovery/placeholder screenshots when a
 * browser is unavailable or the target cannot be reached.
 */
export async function executeWorkflow(
  opts: RecordOptions,
): Promise<RecordingResult> {
  const { reporter, projectId, url, email, password, applicationMap } = opts;
  const enabledSteps = opts.workflow
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order);

  if (enabledSteps.length === 0) {
    await reporter.log("No enabled workflow steps — nothing to record.");
    return { scenes: [], screenshots: [] };
  }

  let browser: Browser | null = null;
  try {
    const { chromium } = await import("playwright");
    await reporter.log("Launching browser for recording…");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    const origin = new URL(url).origin;

    await navigateAndWait(page, url);
    const loggedIn = await login(page, email, password, reporter);
    if (!loggedIn) {
      await reporter.log(
        "WARNING: Recording without authenticated session — scenes may show login or public pages only.",
      );
    }

    const scenes: CapturedScene[] = [];
    for (let i = 0; i < enabledSteps.length; i++) {
      const step = enabledSteps[i];
      await reporter.log(
        `Recording step ${i + 1}/${enabledSteps.length}: ${step.title}`,
      );
      await captureStep(page, step, origin, reporter, applicationMap);
      const scene = await recordScene(page, step, projectId, i);
      scenes.push(scene);
    }

    await browser.close();
    browser = null;

    return {
      scenes,
      screenshots: scenes.map((s) => s.screenshot),
    };
  } catch (err) {
    await reporter.log(
      `Recording via browser failed (${err instanceof Error ? err.message : String(err)}).`,
    );
    if (isBlobStorageError(err)) {
      await reporter.missing("BLOB_ACCESS / Blob store access mismatch");
    } else {
      await reporter.missing("Playwright browser / reachable target application");
    }
    if (browser) await browser.close().catch(() => {});
    const scenes = await buildMockScenes(opts, enabledSteps);
    return { scenes, screenshots: scenes.map((s) => s.screenshot) };
  }
}

/** Alias matching the architecture spec naming. */
export const generateAssets = executeWorkflow;
