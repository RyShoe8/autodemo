import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * Envelope encryption for tenant secrets (target-app passwords, browser
 * sessions).
 *
 * Every organization gets its own random 256-bit data encryption key (DEK).
 * Tenant secrets are encrypted with that DEK; the DEK itself is stored only in
 * wrapped form, encrypted under a master key (KEK) that never touches the
 * database. Consequences that matter for a multi-tenant product:
 *
 * - One tenant's key never decrypts another tenant's data.
 * - Revoking a tenant's key (deleting the wrapped DEK) cryptographically
 *   destroys their stored secrets without touching anyone else's.
 * - The KEK can live in a real KMS; see `lib/crypto/kek.ts`.
 *
 * Ciphertext format is versioned so old values keep working:
 *   v1:<keyId>:<iv>:<tag>:<data>   envelope-encrypted (current)
 *   <iv>:<tag>:<data>              legacy, single shared ENCRYPTION_KEY
 */

const ALGO = "aes-256-gcm";
const VERSION = "v1";
export const DEK_BYTES = 32;

function legacyKey(): Buffer {
  return crypto.createHash("sha256").update(env.encryptionKey).digest();
}

function encryptWith(key: Buffer, plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decryptWith(key: Buffer, ivB64: string, tagB64: string, dataB64: string): string {
  const decipher = crypto.createDecipheriv(
    ALGO,
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Generate a fresh data encryption key for a new organization. */
export function generateDek(): Buffer {
  return crypto.randomBytes(DEK_BYTES);
}

/**
 * Encrypt a tenant secret under the org's DEK. `keyId` is recorded in the
 * ciphertext so rotation can tell which key a value was sealed with.
 */
export function sealWithDek(dek: Buffer, keyId: string, plain: string): string {
  if (plain === "") return "";
  if (keyId.includes(":")) throw new Error("keyId must not contain ':'");
  return `${VERSION}:${keyId}:${encryptWith(dek, plain)}`;
}

/**
 * Decrypt a tenant secret. Accepts both the versioned envelope format and the
 * legacy single-key format so pre-tenancy rows keep working until re-sealed.
 * Returns "" when the value cannot be decrypted (wrong key, tampered, revoked).
 */
export function openWithDek(dek: Buffer | null, payload: string): string {
  if (!payload) return "";
  const parts = payload.split(":");

  if (parts[0] === VERSION) {
    if (parts.length !== 5 || !dek) return "";
    const [, , iv, tag, data] = parts;
    try {
      return decryptWith(dek, iv, tag, data);
    } catch {
      return "";
    }
  }

  // Legacy: iv:tag:data under the shared ENCRYPTION_KEY.
  if (parts.length === 3) {
    try {
      return decryptWith(legacyKey(), parts[0], parts[1], parts[2]);
    } catch {
      return "";
    }
  }

  return "";
}

/** True when a stored value still uses the pre-tenancy single-key format. */
export function isLegacyCiphertext(payload: string): boolean {
  return Boolean(payload) && !payload.startsWith(`${VERSION}:`);
}

/** Extract the keyId a value was sealed under, if it is envelope format. */
export function ciphertextKeyId(payload: string): string | null {
  const parts = payload.split(":");
  return parts[0] === VERSION && parts.length === 5 ? parts[1] : null;
}

/** Wrap (encrypt) an org DEK under a master key for storage. */
export function wrapDek(kek: Buffer, dek: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, kek, iv);
  const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/** Unwrap an org DEK. Throws when the KEK is wrong or the value is tampered. */
export function unwrapDek(kek: Buffer, wrapped: string): Buffer {
  const [ivB64, tagB64, dataB64] = wrapped.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed wrapped data key");
  }
  const decipher = crypto.createDecipheriv(
    ALGO,
    kek,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
}
