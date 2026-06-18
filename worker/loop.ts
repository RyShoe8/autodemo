import { db } from "@/lib/db";
import { runJob } from "@/lib/workflow/orchestrator";
import { env, flags, describeMissing } from "@/lib/env";
import { storage } from "@/lib/storage";
import { createLogger } from "@/lib/logger";
import { sleep } from "@/lib/utils";
import { loadBrowserFnForVerify } from "@/lib/playwright/browser-eval/run";

const log = createLogger("worker");

let running = true;

function verifyBrowserEvalLoader(): void {
  const scripts = [
    "crawl-primary.fn.js",
    "crawl-fallback.fn.js",
    "extract-interactives.fn.js",
    "extract-visible-text.fn.js",
  ];
  for (const script of scripts) {
    const fn = loadBrowserFnForVerify(script);
    if (fn.toString().includes("__name")) {
      throw new Error(`Browser script ${script} serialized with __name`);
    }
  }
  log.info("Browser-eval self-check passed (raw-file loader).");
}

export async function runWorker(): Promise<void> {
  log.info("AutoDemo worker starting…");
  log.info(`Storage driver: ${storage.name}`);
  log.info(
    `Database backend: ${flags.hasMongo ? "MongoDB" : "file (./storage/db)"}`,
  );
  const missing = describeMissing();
  if (missing.length > 0) {
    log.warn(
      `Optional integrations missing (mock fallbacks will be used): ${missing.join(", ")}`,
    );
  }
  log.info(`Polling every ${env.workerPollInterval}ms.`);

  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    log.info("Playwright Chromium launch check passed.");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.warn(
      `Playwright Chromium is not available (${detail}). Discovery and recording jobs will fail until the worker runs with Playwright installed — use the repo Dockerfile or run: npx playwright install chromium`,
    );
  }

  try {
    verifyBrowserEvalLoader();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error(
      `Browser-eval self-check failed (${detail}). Discovery will fail — redeploy the latest worker build.`,
    );
    process.exit(1);
  }

  const shutdown = () => {
    if (!running) return;
    log.info("Shutdown signal received — finishing current job then exiting.");
    running = false;
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (running) {
    try {
      const job = await db.claimNextJob();
      if (job) {
        log.info(`Claimed job ${job.id} (${job.type}) for project ${job.projectId}`);
        await runJob(job);
        log.info(`Finished job ${job.id}`);
        // Immediately check for more work without sleeping.
        continue;
      }
    } catch (err) {
      log.error("Worker loop error", err instanceof Error ? err.message : err);
    }
    await sleep(env.workerPollInterval);
  }

  log.info("Worker stopped.");
  process.exit(0);
}
