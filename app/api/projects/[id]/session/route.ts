import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  clearStoredSession,
  isStorageStateShape,
  saveStoredSession,
} from "@/lib/playwright/session";
import { toProjectDTO } from "@/lib/serialize";
import { requireProject } from "@/lib/auth/guard";
import { audit, clientIp } from "@/lib/audit";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api:projects:session");

const MAX_BODY_BYTES = 1_000_000;

/**
 * Import a Playwright storage state captured outside the pipeline (e.g. via
 * scripts/capture-session.mjs after completing MFA/SSO manually). The state is
 * encrypted at rest and never returned by any endpoint.
 */
const importSessionSchema = z.object({
  storageState: z.object({
    cookies: z.array(z.record(z.string(), z.unknown())),
    origins: z.array(z.record(z.string(), z.unknown())),
  }),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await requireProject(id);
  if (!guard.ok) return guard.response;
  const { auth } = guard.value;

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Session state too large (max 1 MB)" },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Accept either { storageState: {...} } or a bare storage-state object
  // (the exact file Playwright writes), so users can paste it directly.
  const candidate = importSessionSchema.safeParse(body).success
    ? (body as z.infer<typeof importSessionSchema>).storageState
    : body;

  if (!isStorageStateShape(candidate)) {
    return NextResponse.json(
      {
        error:
          'Expected a Playwright storage state: { "cookies": [...], "origins": [...] }',
      },
      { status: 422 },
    );
  }

  try {
    const saved = await saveStoredSession(id, candidate, auth.org.id);
    if (!saved) {
      return NextResponse.json(
        { error: "Session state too large to store" },
        { status: 413 },
      );
    }

    await audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      actorEmail: auth.user.email,
      action: "session.imported",
      targetType: "project",
      targetId: id,
      metadata: { cookies: candidate.cookies.length },
      ip: clientIp(req),
    });

    const updated = await db.getProject(id);
    log.info(`Imported browser session for project ${id}`);
    return NextResponse.json({
      project: updated ? toProjectDTO(updated) : undefined,
    });
  } catch (err) {
    log.error("Failed to import session", err);
    return NextResponse.json(
      { error: "Failed to import session" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await requireProject(id);
  if (!guard.ok) return guard.response;
  const { auth } = guard.value;

  try {
    await clearStoredSession(id);
    await audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      actorEmail: auth.user.email,
      action: "session.cleared",
      targetType: "project",
      targetId: id,
      ip: clientIp(req),
    });
    log.info(`Cleared browser session for project ${id}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("Failed to clear session", err);
    return NextResponse.json(
      { error: "Failed to clear session" },
      { status: 500 },
    );
  }
}
