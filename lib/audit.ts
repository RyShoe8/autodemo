import { db } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import type { AuditAction } from "@/types/tenancy";

const log = createLogger("audit");

/**
 * Append a security-relevant event to the org's audit log.
 *
 * Never fails the caller: an audit write problem must not break a user action.
 * Metadata is restricted to primitives by its type, and callers must keep it
 * non-sensitive — no credentials, cookies, tokens, or key material.
 */
export async function audit(input: {
  orgId: string;
  action: AuditAction;
  userId?: string;
  actorEmail?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean>;
  ip?: string;
}): Promise<void> {
  try {
    await db.createAuditEvent(input);
  } catch (err) {
    log.error(
      `Failed to write audit event ${input.action}`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** Best-effort client IP from proxy headers. */
export function clientIp(req: Request): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}
