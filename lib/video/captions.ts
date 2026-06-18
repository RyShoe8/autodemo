import { storage } from "@/lib/storage";
import type { AudioSegment } from "@/lib/video/voice/types";
import type { Reporter } from "@/lib/workflow/context";

function formatTimestamp(totalSeconds: number): string {
  const ms = Math.round((totalSeconds % 1) * 1000);
  const s = Math.floor(totalSeconds) % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/** Build an SRT string from narration segments and their durations. */
export function buildSrt(
  segments: AudioSegment[],
  offsetSeconds = 0,
): string {
  let cursor = offsetSeconds;
  const blocks: string[] = [];
  segments.forEach((segment, i) => {
    const start = cursor;
    const end = cursor + segment.durationSeconds;
    cursor = end;
    blocks.push(
      `${i + 1}\n${formatTimestamp(start)} --> ${formatTimestamp(end)}\n${segment.text.trim()}\n`,
    );
  });
  return blocks.join("\n");
}

export async function generateCaptions(opts: {
  projectId: string;
  videoId: string;
  segments: AudioSegment[];
  bumperOffsetSeconds?: number;
  reporter: Reporter;
}): Promise<string> {
  const { projectId, videoId, segments, bumperOffsetSeconds = 0, reporter } =
    opts;
  const srt = buildSrt(segments, bumperOffsetSeconds);
  const { url } = await storage.save(
    `projects/${projectId}/videos/${videoId}/captions/captions.srt`,
    srt,
    "application/x-subrip",
  );
  await reporter.log("Captions (SRT) generated.");
  return url;
}
