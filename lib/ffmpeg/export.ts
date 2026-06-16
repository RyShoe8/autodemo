import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { storage } from "@/lib/storage";
import { renderToFile, RENDER_FPS } from "@/lib/video/render";
import { computeDurationInFrames, type DemoVideoProps } from "@/lib/remotion/types";
import { PLATFORM_SPECS, type Platform } from "@/types";
import type { Reporter } from "@/lib/workflow/context";

export interface ExportInput {
  projectId: string;
  masterPath: string;
  baseProps: DemoVideoProps;
  platform: Platform;
  reporter: Reporter;
}

let ffmpegAvailable: boolean | null = null;

export function hasFfmpeg(): boolean {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  const bin = process.env.FFMPEG_PATH || "ffmpeg";
  try {
    const res = spawnSync(bin, ["-version"], { stdio: "ignore" });
    ffmpegAvailable = res.status === 0;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

function masterDurationSeconds(props: DemoVideoProps): number {
  return computeDurationInFrames(props) / RENDER_FPS;
}

async function tmpFile(suffix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "autodemo-"));
  return path.join(dir, `out${suffix}`);
}

function buildVariantProps(
  baseProps: DemoVideoProps,
  platform: Platform,
): DemoVideoProps {
  const spec = PLATFORM_SPECS[platform];
  const master = masterDurationSeconds(baseProps);
  const target = Math.max(spec.minSeconds, Math.min(spec.maxSeconds, master));
  const factor = master > 0 ? target / master : 1;
  const scale = (frames: number) =>
    Math.max(RENDER_FPS, Math.round(frames * factor));
  return {
    ...baseProps,
    width: spec.width,
    height: spec.height,
    introFrames: scale(baseProps.introFrames),
    outroFrames: scale(baseProps.outroFrames),
    scenes: baseProps.scenes.map((s) => ({
      ...s,
      durationInFrames: scale(s.durationInFrames),
    })),
  };
}

async function ffmpegTransform(input: ExportInput): Promise<string> {
  const ffmpegModule = await import("fluent-ffmpeg");
  const ffmpeg = ffmpegModule.default;
  if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);

  const spec = PLATFORM_SPECS[input.platform];
  const out = await tmpFile(".mp4");
  const master = masterDurationSeconds(input.baseProps);
  const filter = `scale=${spec.width}:${spec.height}:force_original_aspect_ratio=decrease,pad=${spec.width}:${spec.height}:(ow-iw)/2:(oh-ih)/2:color=black`;

  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg(input.masterPath)
      .videoFilters(filter)
      .outputOptions([
        "-c:v libx264",
        "-preset veryfast",
        "-pix_fmt yuv420p",
        "-movflags +faststart",
        "-c:a aac",
      ]);
    if (master > spec.maxSeconds) {
      command = command.duration(spec.maxSeconds);
    }
    command
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .save(out);
  });

  return out;
}

/**
 * Produce a platform-specific export from the master video. Uses FFmpeg to
 * reformat/trim the master; if FFmpeg is unavailable, re-renders the variant
 * with Remotion at the target dimensions and duration.
 */
export async function exportPlatform(input: ExportInput): Promise<string> {
  const { reporter, platform, projectId } = input;
  const spec = PLATFORM_SPECS[platform];
  let filePath: string;

  if (hasFfmpeg()) {
    await reporter.log(
      `Exporting ${spec.label} (${spec.width}x${spec.height}) with FFmpeg…`,
    );
    try {
      filePath = await ffmpegTransform(input);
    } catch (err) {
      await reporter.log(
        `FFmpeg export failed (${err instanceof Error ? err.message : String(err)}) — re-rendering with Remotion.`,
      );
      filePath = await renderVariantWithRemotion(input);
    }
  } else {
    await reporter.missing("FFmpeg (binary not found on PATH)");
    await reporter.log(
      `Re-rendering ${spec.label} variant with Remotion at ${spec.width}x${spec.height}…`,
    );
    filePath = await renderVariantWithRemotion(input);
  }

  const buffer = await fs.readFile(filePath);
  const { url } = await storage.save(
    `projects/${projectId}/exports/${platform}.mp4`,
    buffer,
    "video/mp4",
  );
  await fs.rm(path.dirname(filePath), { recursive: true, force: true }).catch(
    () => {},
  );
  await reporter.log(`${spec.label} export ready.`);
  return url;
}

async function renderVariantWithRemotion(input: ExportInput): Promise<string> {
  const props = buildVariantProps(input.baseProps, input.platform);
  const out = await tmpFile(".mp4");
  await renderToFile(props, out, input.reporter);
  return out;
}
