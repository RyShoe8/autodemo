import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("storage");

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

function normalizeKey(key: string): string {
  return key.replace(/^\/+/, "").replace(/\.\.+/g, "");
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
    return `/api/storage/${normalizeKey(key)}`;
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
      access: "public",
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
    // For blob storage, objects are public; fetch by their public URL.
    const res = await fetch(this.url(key));
    if (!res.ok) throw new Error(`Blob read failed: ${res.status}`);
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }

  url(key: string): string {
    // Blob save returns absolute URLs which are stored directly on assets.
    // This is a best-effort fallback for local key resolution.
    return normalizeKey(key);
  }
}

function selectDriver(): StorageDriver {
  if (env.storageDriver === "blob" && env.blobToken) {
    log.info("Using Vercel Blob storage driver");
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
