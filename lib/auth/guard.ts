import "server-only";
import { NextResponse } from "next/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { PRIVILEGED_ROLES } from "@/types/tenancy";
import type {
  JobRecord,
  ProjectRecord,
  ProjectVideoRecord,
} from "@/lib/db/types";

/**
 * Route-handler authorization helpers.
 *
 * Every tenant-scoped route resolves access through here so the org check can
 * never be forgotten: `requireProject` returns the project only when it belongs
 * to the caller's organization, and returns a 404 (not 403) otherwise so the
 * API does not leak the existence of other tenants' resources.
 */

export type Guard<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

export async function requireAuth(): Promise<Guard<AuthContext>> {
  const auth = await getAuthContext();
  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, value: auth };
}

export async function requirePrivileged(): Promise<Guard<AuthContext>> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  if (!PRIVILEGED_ROLES.includes(auth.value.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Requires an owner or admin role" },
        { status: 403 },
      ),
    };
  }
  return auth;
}

const notFound = (): Guard<never> => ({
  ok: false,
  response: NextResponse.json({ error: "Not found" }, { status: 404 }),
});

export async function requireProject(
  projectId: string,
): Promise<Guard<{ auth: AuthContext; project: ProjectRecord }>> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;

  const project = await db.getProject(projectId);
  if (!project || project.orgId !== auth.value.org.id) return notFound();
  return { ok: true, value: { auth: auth.value, project } };
}

/** Resolve a video through its project so the org check cannot be skipped. */
export async function requireVideo(
  videoId: string,
  expectedProjectId?: string,
): Promise<
  Guard<{
    auth: AuthContext;
    project: ProjectRecord;
    video: ProjectVideoRecord;
  }>
> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;

  const video = await db.getVideo(videoId);
  if (!video) return notFound();
  if (expectedProjectId && video.projectId !== expectedProjectId) {
    return notFound();
  }

  const project = await db.getProject(video.projectId);
  if (!project || project.orgId !== auth.value.org.id) return notFound();
  return { ok: true, value: { auth: auth.value, project, video } };
}

/** Resolve a job through its project so the org check cannot be skipped. */
export async function requireJob(
  jobId: string,
): Promise<Guard<{ auth: AuthContext; project: ProjectRecord; job: JobRecord }>> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;

  const job = await db.getJob(jobId);
  if (!job) return notFound();

  const project = await db.getProject(job.projectId);
  if (!project || project.orgId !== auth.value.org.id) return notFound();
  return { ok: true, value: { auth: auth.value, project, job } };
}
