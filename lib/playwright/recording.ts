import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import { isBlobStorageError } from "@/lib/storage/blob-utils";
import { storage } from "@/lib/storage";
import { convertWebmToMp4 } from "@/lib/ffmpeg/convert";
import { placeholderScreenshotSVG } from "@/lib/media/placeholder";
import { login } from "@/lib/playwright/discovery";
import { launchChromium, recordViewport } from "@/lib/playwright/browser";
import { waitForModalInput } from "@/lib/playwright/modal-input";
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
  previousStep?: WorkflowStep,
): Promise<void> {
  const resolved = resolveStep(step, applicationMap);
  const urlBefore = page.url();

  await reporter.log(`Executing ${step.actionType} for "${step.title}"…`);

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
          await page
            .waitForLoadState("domcontentloaded", { timeout: 8000 })
            .catch(() => {});
          await page.waitForTimeout(400);
          await waitForSpaUpdate(page, urlBefore);
        }
        break;
      }
      case "type": {
        if (previousStep?.actionType === "click") {
          await waitForModalInput(page);
        }
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
    await page.waitForTimeout(600);
  } catch (err) {
    await reporter.log(
      `Step "${step.title}" action issue: ${err instanceof Error ? err.message : String(err)} (captured current state).`,
    );
  }
}

/** Capture a scene (screenshot + timestamps) for a step. */
export async function recordScene(
  page: Page,
  step: WorkflowStep,
  projectId: string,
  order: number,
  videoStartMs: number,
  videoEndMs: number,
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
    videoStartMs,
    videoEndMs,
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

async function finalizeScreenRecording(
  context: BrowserContext,
  page: Page,
  projectId: string,
  reporter: Reporter,
): Promise<string | undefined> {
  const video = page.video();
  await context.close();
  if (!video) return undefined;

  const webmPath = await video.path();
  if (!webmPath) return undefined;

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "autodemo-vid-"));
  const mp4Path = path.join(tmpDir, "session.mp4");

  try {
    await convertWebmToMp4(webmPath, mp4Path);
    const buffer = await fs.readFile(mp4Path);
    const { url } = await storage.save(
      `projects/${projectId}/recording/session.mp4`,
      buffer,
      "video/mp4",
    );
    const durationSec = Math.round(buffer.length / 50000);
    await reporter.log(
      `Screen recording saved (session.mp4, ~${Math.max(1, durationSec)}s).`,
    );
    return url;
  } catch (err) {
    await reporter.log(
      `Screen recording conversion failed (${err instanceof Error ? err.message : String(err)}) — using screenshot fallback.`,
    );
    return undefined;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Execute the approved workflow against the live application, capturing a scene
 * per enabled step with continuous screen recording after login.
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
  let recordContext: BrowserContext | null = null;
  try {
    await reporter.log("Launching browser for recording…");
    browser = await launchChromium();
    const viewport = recordViewport();

    const loginContext = await browser.newContext({
      viewport,
      ignoreHTTPSErrors: true,
    });
    const loginPage = await loginContext.newPage();
    const origin = new URL(url).origin;

    await navigateAndWait(loginPage, url);
    const loggedIn = await login(loginPage, email, password, reporter);
    if (!loggedIn) {
      await reporter.log(
        "WARNING: Recording without authenticated session — scenes may show login or public pages only.",
      );
    }

    const postLoginUrl = loginPage.url();
    const storageState = await loginContext.storageState();
    await loginContext.close();

    const videoDir = await fs.mkdtemp(path.join(os.tmpdir(), "autodemo-rec-"));
    recordContext = await browser.newContext({
      viewport,
      ignoreHTTPSErrors: true,
      storageState,
      recordVideo: {
        dir: videoDir,
        size: viewport,
      },
    });
    const page = await recordContext.newPage();
    await navigateAndWait(page, postLoginUrl);

    const recordingStart = Date.now();
    const scenes: CapturedScene[] = [];

    for (let i = 0; i < enabledSteps.length; i++) {
      const step = enabledSteps[i];
      const videoStartMs = Date.now() - recordingStart;
      await reporter.log(
        `Recording step ${i + 1}/${enabledSteps.length}: ${step.title}`,
      );
      const previousStep = i > 0 ? enabledSteps[i - 1] : undefined;
      await captureStep(
        page,
        step,
        origin,
        reporter,
        applicationMap,
        previousStep,
      );
      const videoEndMs = Date.now() - recordingStart;
      const scene = await recordScene(
        page,
        step,
        projectId,
        i,
        videoStartMs,
        videoEndMs,
      );
      scenes.push(scene);
    }

    const rawVideo = await finalizeScreenRecording(
      recordContext,
      page,
      projectId,
      reporter,
    );
    recordContext = null;

    await browser.close();
    browser = null;

    return {
      scenes,
      screenshots: scenes.map((s) => s.screenshot),
      rawVideo,
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
    if (recordContext) await recordContext.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    const scenes = await buildMockScenes(opts, enabledSteps);
    return { scenes, screenshots: scenes.map((s) => s.screenshot) };
  }
}

export const generateAssets = executeWorkflow;
