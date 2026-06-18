/** Client-safe helpers for Vercel Blob URL handling. */

export function isBlobStorageUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export function isPrivateBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes(".private.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export function blobProxyUrl(url: string): string {
  return `/api/storage/blob?url=${encodeURIComponent(url)}`;
}

/** Use authenticated proxy for private blobs; pass through public/local URLs. */
export function assetDisplayUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (isPrivateBlobUrl(url)) return blobProxyUrl(url);
  return url;
}

export function assetDownloadUrl(url: string, name: string): string {
  const display = assetDisplayUrl(url) ?? url;
  if (display.startsWith("/api/storage/blob")) {
    return `${display}&download=1&name=${encodeURIComponent(name)}`;
  }
  return `/api/assets/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;
}
