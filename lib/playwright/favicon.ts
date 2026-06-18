import type { Page } from "playwright";
import { saveBuffer } from "@/lib/storage";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

function extFromUrl(url: string): string | undefined {
  const path = url.split("?")[0].split("#")[0];
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext && ext in MIME_BY_EXT) return ext;
  return undefined;
}

function extFromContentType(contentType: string): string | undefined {
  const ct = contentType.split(";")[0].trim().toLowerCase();
  for (const [ext, mime] of Object.entries(MIME_BY_EXT)) {
    if (mime === ct) return ext;
  }
  if (ct === "image/vnd.microsoft.icon") return "ico";
  return undefined;
}

/**
 * Fetch the site favicon (or apple-touch-icon) and store it as the project logo.
 */
export async function fetchAndStoreSiteLogo(
  page: Page,
  origin: string,
  projectId: string,
): Promise<string | undefined> {
  const iconHref = await page
    .evaluate(() => {
      const link =
        document.querySelector('link[rel="icon"]') ??
        document.querySelector('link[rel="shortcut icon"]') ??
        document.querySelector('link[rel="apple-touch-icon"]');
      return link?.getAttribute("href") ?? null;
    })
    .catch(() => null);

  const candidates = [
    iconHref ? new URL(iconHref, origin).href : null,
    `${origin}/favicon.ico`,
  ].filter(Boolean) as string[];

  for (const href of candidates) {
    try {
      const res = await fetch(href, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 50) continue;
      const ext =
        extFromContentType(contentType) ?? extFromUrl(href) ?? "png";
      return saveBuffer(
        `projects/${projectId}/logo.${ext}`,
        buf,
        MIME_BY_EXT[ext] ?? contentType,
      );
    } catch {
      continue;
    }
  }

  return undefined;
}
