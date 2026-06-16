import "server-only";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { hmac, safeEqual } from "@/lib/crypto";
import { SESSION_COOKIE } from "@/lib/auth/constants";

export { SESSION_COOKIE };
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * Token format: `<issuedAtMs>.<hmac(issuedAtMs)>`.
 * Stateless, signed with AUTH_SECRET. No user records — single admin login.
 */
export function createSessionToken(): string {
  const issuedAt = Date.now().toString();
  const sig = hmac(issuedAt, env.authSecret);
  return `${issuedAt}.${sig}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [issuedAt, sig] = token.split(".");
  if (!issuedAt || !sig) return false;
  const expected = hmac(issuedAt, env.authSecret);
  if (!safeEqual(sig, expected)) return false;
  const ts = Number(issuedAt);
  if (!Number.isFinite(ts)) return false;
  if (Date.now() - ts > SESSION_TTL_MS) return false;
  return true;
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
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
