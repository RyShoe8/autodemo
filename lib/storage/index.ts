import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { isBlobStorageUrl, pathnameFromBlobUrl } from "@/lib/storage/blob-utils";

const log = createLogger("storage");

export { pathnameFromBlobUrl, isBlobStorageUrl } from "@/lib/storage/blob-utils";
export {
  assetDisplayUrl,
  assetDownloadUrl,
  blobProxyUrl,
  isPrivateBlobUrl,
} from "@/lib/storage/urls";

export interface StoredObject {
  key: string;
  url: string;
  contentType: string;
  size: number;
}

export interface StorageDriver {
  save(
    key: string,
    data: Buffer | string,
    contentType: string,
  ): Promise<StoredObject>;
  read(key: string): Promise<Buffer>;
  url(key: string): string;
  name: string;
}

const LOCAL_ROOT = path.join(process.cwd(), "storage", "files");
const LOCAL_PREFIX = "/api/storage/";

function normalizeKey(key: string): string {
  return key.replace(/^\/+/, "").replace(/\.\.+/g, "");
}

async function streamToBuffer(
  stream: ReadableStream<Uint8Array>,
): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

class LocalDriver implements StorageDriver {
  name = "local";

  async save(
    key: string,
    data: Buffer | string,
    contentType: string,
  ): Promise<StoredObject> {
    const safeKey = normalizeKey(key);
    const filePath = path.join(LOCAL_ROOT, safeKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const buffer = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    await fs.writeFile(filePath, buffer);
    return {
      key: safeKey,
      url: this.url(safeKey),
      contentType,
      size: buffer.length,
    };
  }

  async read(key: string): Promise<Buffer> {
    const filePath = path.join(LOCAL_ROOT, normalizeKey(key));
    return fs.readFile(filePath);
  }

  url(key: string): string {
    return `${LOCAL_PREFIX}${normalizeKey(key)}`;
  }
}

class BlobDriver implements StorageDriver {
  name = "blob";

  async save(
    key: string,
    data: Buffer | string,
    contentType: string,
  ): Promise<StoredObject> {
    const { put } = await import("@vercel/blob");
    const safeKey = normalizeKey(key);
    const body = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    const result = await put(safeKey, body, {
      access: env.blobAccess,
      contentType,
      token: env.blobToken,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return {
      key: safeKey,
      url: result.url,
      contentType,
      size: body.length,
    };
  }

  async read(key: string): Promise<Buffer> {
    const { get } = await import("@vercel/blob");
    const result = await get(normalizeKey(key), {
      access: env.blobAccess,
      token: env.blobToken,
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error(`Blob read failed: ${result?.statusCode ?? "unknown"}`);
    }
    return streamToBuffer(result.stream);
  }

  url(key: string): string {
    return normalizeKey(key);
  }
}

function selectDriver(): StorageDriver {
  if (env.storageDriver === "blob" && env.blobToken) {
    log.info(
      `Using Vercel Blob storage driver (access: ${env.blobAccess})`,
    );
    return new BlobDriver();
  }
  if (env.storageDriver === "blob" && !env.blobToken) {
    log.warn(
      "STORAGE_DRIVER=blob but BLOB_READ_WRITE_TOKEN missing — falling back to local storage",
    );
  }
  return new LocalDriver();
}

const globalForStorage = globalThis as unknown as {
  __storage__?: StorageDriver;
};

export const storage: StorageDriver =
  globalForStorage.__storage__ ?? selectDriver();
globalForStorage.__storage__ = storage;

/** Convenience helpers */
export async function saveBuffer(
  key: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  const result = await storage.save(key, data, contentType);
  return result.url;
}

export async function saveText(
  key: string,
  text: string,
  contentType = "text/plain",
): Promise<string> {
  const result = await storage.save(key, text, contentType);
  return result.url;
}

/**
 * Read asset bytes from a local storage URL, Vercel Blob URL, or plain HTTP URL.
 */
export async function readAsset(url: string): Promise<Buffer> {
  if (!url) throw new Error("readAsset: url is required");
  if (url.startsWith("data:")) {
    const base64 = url.split(",")[1];
    if (!base64) throw new Error("readAsset: invalid data URI");
    return Buffer.from(base64, "base64");
  }

  if (url.startsWith(LOCAL_PREFIX)) {
    const key = url.slice(LOCAL_PREFIX.length);
    return storage.read(key);
  }

  const pathname = pathnameFromBlobUrl(url);
  if (pathname && storage.name === "blob") {
    return storage.read(pathname);
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP read failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  throw new Error(`Unsupported asset URL: ${url}`);
}

export function contentTypeFromUrl(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const mime: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    srt: "application/x-subrip",
    json: "application/json",
    txt: "text/plain",
  };
  return mime[ext] ?? "application/octet-stream";
}
