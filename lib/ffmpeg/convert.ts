import { spawnSync } from "node:child_process";
import { hasFfmpeg } from "@/lib/ffmpeg/export";

/** Convert Playwright WebM screen recording to H.264 MP4 for Remotion/FFmpeg. */
export async function convertWebmToMp4(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  if (!hasFfmpeg()) {
    throw new Error("FFmpeg is required to convert screen recordings");
  }
  const bin = process.env.FFMPEG_PATH || "ffmpeg";
  const res = spawnSync(
    bin,
    [
      "-y",
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
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
    throw new Error(`FFmpeg WebM conversion failed: ${err.slice(0, 400)}`);
  }
}
