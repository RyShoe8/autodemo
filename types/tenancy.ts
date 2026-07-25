/** Multi-tenancy domain types shared by the app and the worker. */

export type OrgRole = "owner" | "admin" | "member";

/** Roles allowed to manage members, billing, credentials, and stored sessions. */
export const PRIVILEGED_ROLES: OrgRole[] = ["owner", "admin"];

export interface OrgDTO {
  id: string;
  name: string;
  slug: string;
  /** False once the tenant key has been revoked — secrets are unreadable. */
  hasEncryptionKey: boolean;
  createdAt: string;
}

export interface UserDTO {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
}

export interface MembershipDTO {
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  email: string;
  name?: string;
  createdAt: string;
}

export type AuditAction =
  | "user.signup"
  | "user.login"
  | "user.login_failed"
  | "user.logout"
  | "org.created"
  | "org.key_revoked"
  | "org.key_rotated"
  | "member.added"
  | "member.role_changed"
  | "member.removed"
  | "project.created"
  | "project.updated"
  | "project.deleted"
  | "credentials.updated"
  | "session.imported"
  | "session.captured"
  | "session.cleared"
  | "connect.started"
  | "connect.completed"
  | "connect.cancelled";

export interface AuditEventDTO {
  id: string;
  orgId: string;
  userId?: string;
  actorEmail?: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  /** Non-sensitive context only — never credentials, cookies, or key material. */
  metadata?: Record<string, string | number | boolean>;
  ip?: string;
  createdAt: string;
}

export type ConnectSessionStatus =
  | "pending"
  | "live"
  | "captured"
  | "expired"
  | "failed"
  | "cancelled";

export interface ConnectSessionDTO {
  id: string;
  orgId: string;
  projectId: string;
  status: ConnectSessionStatus;
  startUrl: string;
  error?: string;
  expiresAt: string;
  createdAt: string;
}
