import type { Browser } from "playwright";
import { env } from "@/lib/env";

const DEFAULT_CHROMIUM_ARGS = [
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-software-rasterizer",
  "--no-first-run",
  "--no-default-browser-check",
];

function chromiumLaunchArgs(): string[] {
  const extra = env.playwrightChromiumArgs;
  return extra ? [...DEFAULT_CHROMIUM_ARGS, ...extra] : DEFAULT_CHROMIUM_ARGS;
}

/** Launch Chromium with Docker-safe, low-memory defaults for the worker. */
export async function launchChromium(): Promise<Browser> {
  const { chromium } = await import("playwright");
  return chromium.launch({
    headless: true,
    args: chromiumLaunchArgs(),
  });
}

export function recordViewport(): { width: number; height: number } {
  return {
    width: env.recordViewportWidth,
    height: env.recordViewportHeight,
  };
}
