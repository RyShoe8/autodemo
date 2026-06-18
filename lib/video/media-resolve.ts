import fs from "node:fs/promises";
import { readAsset } from "@/lib/storage";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mp4: "video/mp4",
};

function mimeFromUrl(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

/**
 * Resolve a stored asset URL to a base64 data URI so Remotion can render it
 * without requiring the Next.js server to be reachable from the worker.
 */
export async function toDataUri(url: string): Promise<string> {
  if (!url) return url;
  if (url.startsWith("data:")) return url;

  try {
    const buffer = await readAsset(url);
    return `data:${mimeFromUrl(url)};base64,${buffer.toString("base64")}`;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to resolve asset for render: ${detail} (${url})`);
  }
}

/**
 * Download a video asset to a local file for Remotion OffthreadVideo.
 * Server-side rendering accepts absolute paths without the HTTP proxy.
 */
export async function resolveVideoToLocalFile(
  url: string,
  destPath: string,
): Promise<string> {
  const buffer = await readAsset(url);
  await fs.writeFile(destPath, buffer);
  return destPath;
}
