import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function hasFfmpegBin(): boolean {
  const bin = process.env.FFMPEG_PATH || "ffmpeg";
  try {
    const res = spawnSync(bin, ["-version"], { stdio: "ignore" });
    return res.status === 0;
  } catch {
    return false;
  }
}

/**
 * Scale a video to target dimensions with letterboxing (same as platform exports).
 */
export async function scaleVideoToFit(
  inputPath: string,
  width: number,
  height: number,
  outputPath: string,
): Promise<void> {
  const ffmpegModule = await import("fluent-ffmpeg");
  const ffmpeg = ffmpegModule.default;
  if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);

  const filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`;

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters(filter)
      .outputOptions([
        "-c:v libx264",
        "-preset veryfast",
        "-pix_fmt yuv420p",
        "-an",
        "-movflags +faststart",
      ])
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .save(outputPath);
  });
}

/**
 * Prepend a silent bumper clip to a body export. Bumper is never trimmed.
 */
export async function prependBumperToExport(opts: {
  bumperPath: string;
  bodyPath: string;
  outputPath: string;
  width: number;
  height: number;
  bodyMaxSeconds?: number;
}): Promise<void> {
  const ffmpegModule = await import("fluent-ffmpeg");
  const ffmpeg = ffmpegModule.default;
  if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "autodemo-bumper-"));
  const scaledBumper = path.join(tmpDir, "bumper-scaled.mp4");
  const trimmedBody = path.join(tmpDir, "body-trimmed.mp4");
  const concatList = path.join(tmpDir, "concat.txt");

  try {
    await scaleVideoToFit(opts.bumperPath, opts.width, opts.height, scaledBumper);

    let bodyInput = opts.bodyPath;
    if (opts.bodyMaxSeconds !== undefined) {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(opts.bodyPath)
          .outputOptions(["-c copy", "-t", String(opts.bodyMaxSeconds)])
          .on("end", () => resolve())
          .on("error", (err: Error) => reject(err))
          .save(trimmedBody);
      });
      bodyInput = trimmedBody;
    }

    await fs.writeFile(
      concatList,
      `file '${scaledBumper.replace(/\\/g, "/")}'\nfile '${bodyInput.replace(/\\/g, "/")}'\n`,
      "utf8",
    );

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatList)
        .inputOptions(["-f concat", "-safe 0"])
        .outputOptions([
          "-c:v libx264",
          "-preset veryfast",
          "-pix_fmt yuv420p",
          "-c:a aac",
          "-movflags +faststart",
        ])
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .save(opts.outputPath);
    });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
