import crypto from "node:crypto";

/**
 * Connect-session tokens.
 *
 * The raw token is generated once, returned to the initiating user, and never
 * stored: only its SHA-256 hash goes in the database. It authorizes exactly
 * one remote-login session (one project, one org, short TTL) and is the only
 * credential the browser presents to the worker's WebSocket endpoint.
 */

export function generateConnectToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: hashConnectToken(token) };
}

export function hashConnectToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
