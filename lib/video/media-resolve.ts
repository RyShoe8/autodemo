import { storage } from "@/lib/storage";

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

  const localPrefix = "/api/storage/";
  try {
    if (url.startsWith(localPrefix)) {
      const key = url.slice(localPrefix.length);
      const buffer = await storage.read(key);
      return `data:${mimeFromUrl(key)};base64,${buffer.toString("base64")}`;
    }
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const res = await fetch(url);
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") ?? mimeFromUrl(url);
      return `data:${contentType};base64,${buffer.toString("base64")}`;
    }
  } catch {
    return url;
  }
  return url;
}
