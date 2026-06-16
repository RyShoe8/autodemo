import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * AES-256-GCM encryption for sensitive values (target-application login
 * passwords) stored at rest. The key is derived from ENCRYPTION_KEY via SHA-256
 * so any string length is accepted.
 */

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  return crypto.createHash("sha256").update(env.encryptionKey).digest();
}

export function encrypt(plain: string): string {
  if (plain === "") return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decrypt(payload: string): string {
  if (!payload) return "";
  const parts = payload.split(":");
  if (parts.length !== 3) {
    // Value was not encrypted with this scheme; return as-is to stay resilient.
    return payload;
  }
  try {
    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}

/** Constant-time string comparison for secrets. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function hmac(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}
