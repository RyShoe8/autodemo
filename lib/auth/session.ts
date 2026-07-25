import "server-only";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { hmac, safeEqual } from "@/lib/crypto";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { db } from "@/lib/db";
import type { MembershipRecord, OrgRecord, UserRecord } from "@/lib/db/types";
import type { OrgRole } from "@/types/tenancy";

export { SESSION_COOKIE };
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * Token format: `<userId>.<orgId>.<issuedAtMs>.<hmac(payload)>`.
 * Stateless and signed with AUTH_SECRET; the org is carried in the token so
 * every request has an unambiguous tenant scope. Membership is re-checked on
 * each request so revoking access takes effect immediately.
 */
export function createSessionToken(userId: string, orgId: string): string {
  const issuedAt = Date.now().toString();
  const payload = `${userId}.${orgId}.${issuedAt}`;
  return `${payload}.${hmac(payload, env.authSecret)}`;
}

export interface SessionClaims {
  userId: string;
  orgId: string;
}

export function verifySessionToken(
  token: string | undefined,
): SessionClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, orgId, issuedAt, sig] = parts;
  const expected = hmac(`${userId}.${orgId}.${issuedAt}`, env.authSecret);
  if (!safeEqual(sig, expected)) return null;
  const ts = Number(issuedAt);
  if (!Number.isFinite(ts) || Date.now() - ts > SESSION_TTL_MS) return null;
  return { userId, orgId };
}

export interface AuthContext {
  user: UserRecord;
  org: OrgRecord;
  membership: MembershipRecord;
  role: OrgRole;
}

/**
 * Resolve the caller's user + organization, verifying that the membership
 * still exists. Returns null when unauthenticated or no longer a member.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const store = await cookies();
  const claims = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;

  const [user, org, membership] = await Promise.all([
    db.getUser(claims.userId),
    db.getOrg(claims.orgId),
    db.getMembership(claims.orgId, claims.userId),
  ]);
  if (!user || !org || !membership) return null;

  return { user, org, membership, role: membership.role };
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getAuthContext()) !== null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.nodeEnv === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}
