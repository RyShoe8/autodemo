import "server-only";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAuthContext, type AuthContext } from "@/lib/auth/session";
import type { ProjectRecord } from "@/lib/db/types";

/**
 * Server-component equivalents of lib/auth/guard.ts. Pages resolve tenant
 * access through these so a project belonging to another organization is
 * indistinguishable from one that does not exist.
 */

export async function requirePageAuth(): Promise<AuthContext> {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  return auth;
}

export async function requirePageProject(
  projectId: string,
): Promise<{ auth: AuthContext; project: ProjectRecord }> {
  const auth = await requirePageAuth();
  const project = await db.getProject(projectId);
  if (!project || project.orgId !== auth.org.id) notFound();
  return { auth, project };
}
