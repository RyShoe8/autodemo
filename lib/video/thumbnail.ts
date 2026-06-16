import { storage } from "@/lib/storage";
import { placeholderThumbnailSVG } from "@/lib/media/placeholder";
import type { Reporter } from "@/lib/workflow/context";

export interface ThumbnailOptions {
  projectId: string;
  title: string;
  headline: string;
  baseScreenshotUrl?: string;
  width?: number;
  height?: number;
  reporter: Reporter;
}

function localKeyFromUrl(url?: string): string | null {
  if (!url) return null;
  const prefix = "/api/storage/";
  if (url.startsWith(prefix)) return url.slice(prefix.length);
  return null;
}

/**
 * Generate a PNG thumbnail from a base application screenshot, the project title
 * and a generated headline. Uses sharp to rasterize an SVG overlay. Falls back
 * to storing an SVG thumbnail if rasterization is unavailable.
 */
export async function generateThumbnail(
  opts: ThumbnailOptions,
): Promise<string> {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const { projectId, title, headline, reporter } = opts;

  const svg = placeholderThumbnailSVG({ title, headline, width, height });

  try {
    const sharp = (await import("sharp")).default;

    let base: Buffer | null = null;
    const key = localKeyFromUrl(opts.baseScreenshotUrl);
    if (key && key.endsWith(".png")) {
      try {
        const screenshot = await storage.read(key);
        base = await sharp(screenshot)
          .resize(width, height, { fit: "cover" })
          .modulate({ brightness: 0.55 })
          .toBuffer();
      } catch {
        base = null;
      }
    }

    let pipeline = sharp(base ?? Buffer.from(svg)).resize(width, height, {
      fit: "cover",
    });

    if (base) {
      // Overlay the text band SVG on top of the darkened screenshot.
      pipeline = sharp(base).composite([
        { input: Buffer.from(svgTextBand(title, headline, width, height)) },
      ]);
    }

    const png = await pipeline.png().toBuffer();
    const { url } = await storage.save(
      `projects/${projectId}/thumbnails/thumbnail.png`,
      png,
      "image/png",
    );
    await reporter.log("Thumbnail generated (PNG).");
    return url;
  } catch (err) {
    await reporter.log(
      `PNG thumbnail rasterization unavailable (${err instanceof Error ? err.message : String(err)}) — storing SVG thumbnail.`,
    );
    const { url } = await storage.save(
      `projects/${projectId}/thumbnails/thumbnail.svg`,
      svg,
      "image/svg+xml",
    );
    return url;
  }
}

function svgTextBand(
  title: string,
  headline: string,
  width: number,
  height: number,
): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect x="48" y="${height - 220}" width="${width - 96}" height="160" rx="20" fill="#0f172a" opacity="0.72"/>
    <text x="80" y="${height - 148}" font-family="Inter, Arial, sans-serif" font-size="56" font-weight="800" fill="#ffffff">${esc(headline)}</text>
    <text x="80" y="${height - 92}" font-family="Inter, Arial, sans-serif" font-size="28" fill="#cbd5e1">${esc(title)}</text>
  </svg>`;
}
