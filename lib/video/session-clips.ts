import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { hasFfmpeg } from "@/lib/ffmpeg/export";

export interface SceneClipInput {
  index: number;
  videoStartMs: number;
  videoEndMs: number;
}

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

/** Cut per-scene segments from the full session recording for fast Remotion seeks. */
export async function sliceSessionClips(
  sessionPath: string,
  scenes: SceneClipInput[],
  outDir: string,
  jobId: string,
): Promise<Map<number, string>> {
  if (!hasFfmpeg()) {
    throw new Error("FFmpeg is required to slice screen recording clips");
  }

  await fs.mkdir(outDir, { recursive: true });
  const clips = new Map<number, string>();

  for (const scene of scenes) {
    const { index, videoStartMs, videoEndMs } = scene;
    if (videoEndMs <= videoStartMs) continue;

    const startSec = videoStartMs / 1000;
    const durationSec = Math.max(0.1, (videoEndMs - videoStartMs) / 1000);
    const outputPath = path.join(
      outDir,
      `session-${jobId}-scene-${index}.mp4`,
    );

    sliceOneClip(sessionPath, outputPath, startSec, durationSec);
    clips.set(index, outputPath);
  }

  return clips;
}

export function sceneClipAssetName(jobId: string, index: number): string {
  return `session-${jobId}-scene-${index}.mp4`;
}
