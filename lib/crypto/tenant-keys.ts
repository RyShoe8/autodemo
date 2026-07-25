import { db } from "@/lib/db";
import { kekProvider } from "@/lib/crypto/kek";
import {
  generateDek,
  openWithDek,
  sealWithDek,
} from "@/lib/crypto/envelope";

/**
 * Per-organization data keys.
 *
 * Callers never handle raw key material: they seal/open secrets by orgId and
 * this module resolves, unwraps, and caches the DEK. Unwrapped keys are held
 * in memory only, for a short TTL, so a revoked key stops working quickly
 * across long-lived worker processes.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  dek: Buffer;
  keyId: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Drop a cached key immediately (call on revoke/rotate). */
export function evictTenantKey(orgId: string): void {
  cache.delete(orgId);
}

async function resolveKey(orgId: string): Promise<CacheEntry | null> {
  const cached = cache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) return cached;
  cache.delete(orgId);

  const org = await db.getOrg(orgId);
  if (!org || !org.wrappedDek || !org.kekId || !org.dekId) return null;

  try {
    const dek = await kekProvider().unwrap(org.wrappedDek, org.kekId);
    const entry: CacheEntry = {
      dek,
      keyId: org.dekId,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    cache.set(orgId, entry);
    return entry;
  } catch {
    return null;
  }
}

/**
 * Create a fresh wrapped data key. Returns the fields to persist on the org.
 */
export async function createTenantKey(): Promise<{
  wrappedDek: string;
  kekId: string;
  dekId: string;
}> {
  const provider = kekProvider();
  const dek = generateDek();
  const kekId = provider.activeKekId;
  const wrappedDek = await provider.wrap(dek, kekId);
  return { wrappedDek, kekId, dekId: `k${Date.now().toString(36)}` };
}

/** Encrypt a secret for an organization. Throws if the org has no usable key. */
export async function sealForOrg(orgId: string, plain: string): Promise<string> {
  if (plain === "") return "";
  const entry = await resolveKey(orgId);
  if (!entry) {
    throw new Error(
      `No usable encryption key for organization ${orgId}. The key may have been revoked.`,
    );
  }
  return sealWithDek(entry.dek, entry.keyId, plain);
}

/**
 * Decrypt a secret belonging to an organization. Returns "" when the value is
 * missing, tampered, or sealed under a key that no longer exists — callers
 * treat that the same as "no credential stored".
 */
export async function openForOrg(orgId: string, payload: string): Promise<string> {
  if (!payload) return "";
  const entry = await resolveKey(orgId);
  return openWithDek(entry?.dek ?? null, payload);
}

/**
 * Cryptographic erasure: discard the org's wrapped key so every secret sealed
 * under it becomes permanently undecryptable.
 */
export async function revokeTenantKey(orgId: string): Promise<void> {
  evictTenantKey(orgId);
  await db.updateOrg(orgId, { wrappedDek: "", dekId: "", kekId: "" });
}
