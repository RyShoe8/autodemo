import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { hasFfmpeg } from "@/lib/ffmpeg/export";
import type { Reporter } from "@/lib/workflow/context";

export interface SceneClipInput {
  index: number;
  videoStartMs: number;
  videoEndMs: number;
  maxDurationSec?: number;
}

const SLICE_CONCURRENCY = 4;

function ffmpegBin(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

function sliceOneClip(
  sessionPath: string,
  outputPath: string,
  startSec: number,
  durationSec: number,
): void {
  const res = spawnSync(
    ffmpegBin(),
    [
      "-y",
      "-ss",
      String(startSec),
      "-i",
      sessionPath,
      "-t",
      String(durationSec),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      outputPath,
    ],
    { stdio: "pipe" },
  );
  if (res.status !== 0) {
    const err = res.stderr?.toString() || "unknown error";
    throw new Error(`FFmpeg clip slice failed: ${err.slice(0, 400)}`);
  }
}

async function sliceSceneClip(
  sessionPath: string,
  scene: SceneClipInput,
  outDir: string,
  jobId: string,
  reporter?: Reporter,
): Promise<[number, string] | null> {
  const { index, videoStartMs, videoEndMs, maxDurationSec } = scene;
  if (videoEndMs <= videoStartMs) return null;

  const startSec = videoStartMs / 1000;
  const clipSec = Math.max(0.1, (videoEndMs - videoStartMs) / 1000);
  const durationSec =
    maxDurationSec !== undefined
      ? Math.min(clipSec, maxDurationSec)
      : clipSec;

  if (maxDurationSec !== undefined && clipSec > maxDurationSec && reporter) {
    await reporter.log(
      `Trimmed scene ${index + 1} clip from ${clipSec.toFixed(1)}s to ${durationSec.toFixed(1)}s.`,
    );
  }

  const outputPath = path.join(outDir, `session-${jobId}-scene-${index}.mp4`);
  sliceOneClip(sessionPath, outputPath, startSec, durationSec);
  return [index, outputPath];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await fn(items[current]);
    }
  }

  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/** Cut per-scene segments from the full session recording for fast Remotion seeks. */
export async function sliceSessionClips(
  sessionPath: string,
  scenes: SceneClipInput[],
  outDir: string,
  jobId: string,
  reporter?: Reporter,
): Promise<Map<number, string>> {
  if (!hasFfmpeg()) {
    throw new Error("FFmpeg is required to slice screen recording clips");
  }

  await fs.mkdir(outDir, { recursive: true });

  const pairs = await mapWithConcurrency(
    scenes,
    SLICE_CONCURRENCY,
    (scene) => sliceSceneClip(sessionPath, scene, outDir, jobId, reporter),
  );

  const clips = new Map<number, string>();
  for (const pair of pairs) {
    if (pair) clips.set(pair[0], pair[1]);
  }
  return clips;
}

export function sceneClipAssetName(jobId: string, index: number): string {
  return `session-${jobId}-scene-${index}.mp4`;
}
