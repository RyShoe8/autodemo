/** Server-side Vercel Blob URL parsing. */

export function isBlobStorageUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/** Extract blob pathname from a full Vercel Blob URL. */
export function pathnameFromBlobUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(".blob.vercel-storage.com")) return null;
    const pathname = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    return pathname.length > 0 ? pathname : null;
  } catch {
    return null;
  }
}

export function isBlobStorageError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Vercel Blob") ||
    msg.includes("private store") ||
    msg.includes("public access") ||
    msg.includes("BLOB_ACCESS")
  );
}
