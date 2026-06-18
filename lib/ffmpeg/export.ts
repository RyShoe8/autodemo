import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { storage, readAsset } from "@/lib/storage";
import { renderToFile, RENDER_FPS } from "@/lib/video/render";
import { prependBumperToExport } from "@/lib/ffmpeg/concat";
import { computeDurationInFrames, type DemoVideoProps } from "@/lib/remotion/types";
import { PLATFORM_SPECS, type Platform } from "@/types";
import type { Reporter } from "@/lib/workflow/context";

export interface ExportBranding {
  bumperEnabled: boolean;
  bumperUrl?: string;
  bumperDurationSeconds: number;
}

export interface ExportInput {
  projectId: string;
  videoId: string;
  masterPath: string;
  baseProps: DemoVideoProps;
  platform: Platform;
  branding: ExportBranding;
  reporter: Reporter;
  variantKey?: string;
  maxSeconds?: number;
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
  maxSecondsOverride?: number,
): DemoVideoProps {
  const spec = PLATFORM_SPECS[platform];
  const cap = maxSecondsOverride ?? spec.maxSeconds;
  const master = masterDurationSeconds(baseProps);
  const target = Math.max(spec.minSeconds, Math.min(cap, master));
  const factor = master > 0 ? target / master : 1;
  const scale = (frames: number) =>
    Math.max(RENDER_FPS, Math.round(frames * factor));
  return {
    ...baseProps,
    width: spec.width,
    height: spec.height,
    introFrames: scale(baseProps.introFrames),
    outroFrames: scale(baseProps.outroFrames),
    bumperFrames: 0,
    bumperEnabled: false,
    scenes: baseProps.scenes.map((s) => ({
      ...s,
      durationInFrames: scale(s.durationInFrames),
    })),
  };
}

async function ffmpegTransformBody(input: ExportInput): Promise<string> {
  const ffmpegModule = await import("fluent-ffmpeg");
  const ffmpeg = ffmpegModule.default;
  if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);

  const spec = PLATFORM_SPECS[input.platform];
  const cap = input.maxSeconds ?? spec.maxSeconds;
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
    if (master > cap) {
      command = command.duration(cap);
    }
    command
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .save(out);
  });

  return out;
}

async function applyBumperIfNeeded(
  input: ExportInput,
  bodyPath: string,
): Promise<string> {
  const useBumper =
    input.branding.bumperEnabled &&
    Boolean(input.branding.bumperUrl) &&
    hasFfmpeg();

  if (!useBumper || !input.branding.bumperUrl) {
    return bodyPath;
  }

  const spec = PLATFORM_SPECS[input.platform];
  const cap = input.maxSeconds ?? spec.maxSeconds;
  const out = await tmpFile("-with-bumper.mp4");
  const tmpDir = path.dirname(bodyPath);

  const bumperTmp = path.join(tmpDir, "bumper-source.mp4");
  const bumperBuffer = await readAsset(input.branding.bumperUrl);
  await fs.writeFile(bumperTmp, bumperBuffer);

  await input.reporter.log(
    `Prepending ${input.branding.bumperDurationSeconds}s project bumper…`,
  );

  await prependBumperToExport({
    bumperPath: bumperTmp,
    bodyPath,
    outputPath: out,
    width: spec.width,
    height: spec.height,
    bodyMaxSeconds: cap,
  });

  return out;
}

export async function exportPlatform(input: ExportInput): Promise<string> {
  const { reporter, platform, projectId, videoId } = input;
  const spec = PLATFORM_SPECS[platform];
  let filePath: string;

  if (hasFfmpeg()) {
    await reporter.log(
      `Exporting ${spec.label} (${spec.width}x${spec.height}) with FFmpeg…`,
    );
    try {
      const bodyPath = await ffmpegTransformBody(input);
      filePath = await applyBumperIfNeeded(input, bodyPath);
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
  const storageKey = input.variantKey ?? platform;
  const { url } = await storage.save(
    `projects/${projectId}/videos/${videoId}/exports/${storageKey}.mp4`,
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
  const props = buildVariantProps(
    input.baseProps,
    input.platform,
    input.maxSeconds,
  );
  const out = await tmpFile(".mp4");
  await renderToFile(props, out, input.reporter);
  return applyBumperIfNeeded(input, out);
}
