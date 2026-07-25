import type { BrowserContext } from "playwright";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import type { ProjectRecord } from "@/lib/db/types";
import type { Reporter } from "@/lib/workflow/context";

/**
 * Persisted authenticated browser sessions.
 *
 * After any successful login (automated or manually imported) the Playwright
 * storageState (cookies + localStorage) is encrypted with the same AES-256-GCM
 * scheme as passwords and stored on the project. Subsequent jobs start from
 * that state so login becomes a rare event instead of a per-job gamble, and
 * MFA/SSO sessions captured manually keep working until they expire.
 */

export type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

const MAX_STATE_BYTES = 1_000_000;

/** Shape-check an unknown value as a Playwright storage state. */
export function isStorageStateShape(value: unknown): value is StorageState {
  if (!value || typeof value !== "object") return false;
  const v = value as { cookies?: unknown; origins?: unknown };
  return Array.isArray(v.cookies) && Array.isArray(v.origins);
}

/** Decrypt and parse the project's stored session, or null when absent/corrupt. */
export function loadStoredSession(
  project: Pick<ProjectRecord, "encryptedStorageState">,
): StorageState | null {
  if (!project.encryptedStorageState) return null;
  const json = decrypt(project.encryptedStorageState);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    return isStorageStateShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Encrypt and persist a storage state on the project. */
export async function saveStoredSession(
  projectId: string,
  state: StorageState,
  reporter?: Reporter,
): Promise<boolean> {
  const json = JSON.stringify(state);
  if (json.length > MAX_STATE_BYTES) {
    await reporter?.log(
      `Session state too large to store (${Math.round(json.length / 1024)} KB) — skipping.`,
    );
    return false;
  }
  await db.updateProject(projectId, {
    encryptedStorageState: encrypt(json),
    storageStateSavedAt: new Date(),
  });
  await reporter?.log("Saved authenticated browser session for reuse.");
  return true;
}

/** Capture the context's current state and persist it (non-fatal on error). */
export async function persistContextSession(
  projectId: string,
  context: BrowserContext,
  reporter?: Reporter,
): Promise<void> {
  try {
    const state = await context.storageState();
    if (state.cookies.length === 0 && state.origins.length === 0) return;
    await saveStoredSession(projectId, state, reporter);
  } catch (err) {
    await reporter?.log(
      `Could not persist session state: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Remove the stored session (e.g. it expired or the user cleared it). */
export async function clearStoredSession(projectId: string): Promise<void> {
  await db.updateProject(projectId, {
    encryptedStorageState: "",
    // null (not undefined) so Mongoose actually clears the field.
    storageStateSavedAt: null as unknown as Date,
  });
}
