import { db } from "@/lib/db";
import { createTenantKey } from "@/lib/crypto/tenant-keys";
import { hashPassword } from "@/lib/auth/password";
import type { OrgRecord, UserRecord } from "@/lib/db/types";
import type { OrgRole } from "@/types/tenancy";

/** URL-safe org slug, uniquified against existing orgs. */
export async function uniqueSlug(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "org";

  if (!(await db.getOrgBySlug(base))) return base;
  for (let i = 2; i < 200; i++) {
    const candidate = `${base}-${i}`;
    if (!(await db.getOrgBySlug(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Create an organization with its own freshly generated, wrapped data key.
 * Every tenant secret is later sealed under this key.
 */
export async function createOrgWithKey(name: string): Promise<OrgRecord> {
  const { wrappedDek, kekId, dekId } = await createTenantKey();
  return db.createOrg({
    name,
    slug: await uniqueSlug(name),
    wrappedDek,
    kekId,
    dekId,
  });
}

/** Create a user, an org, and the owner membership joining them. */
export async function createAccount(input: {
  email: string;
  password: string;
  name?: string;
  organizationName: string;
}): Promise<{ user: UserRecord; org: OrgRecord }> {
  const passwordHash = await hashPassword(input.password);
  const user = await db.createUser({
    email: input.email,
    passwordHash,
    name: input.name,
  });
  const org = await createOrgWithKey(input.organizationName);
  await db.createMembership({ orgId: org.id, userId: user.id, role: "owner" });
  return { user, org };
}

/** Add a user to an existing organization. */
export async function addMember(input: {
  orgId: string;
  email: string;
  password: string;
  name?: string;
  role: OrgRole;
}): Promise<UserRecord> {
  const existing = await db.getUserByEmail(input.email);
  const user =
    existing ??
    (await db.createUser({
      email: input.email,
      passwordHash: await hashPassword(input.password),
      name: input.name,
    }));

  const membership = await db.getMembership(input.orgId, user.id);
  if (!membership) {
    await db.createMembership({
      orgId: input.orgId,
      userId: user.id,
      role: input.role,
    });
  }
  return user;
}
