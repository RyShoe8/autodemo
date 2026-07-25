import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env, flags } from "@/lib/env";
import { requireProject } from "@/lib/auth/guard";
import { generateConnectToken } from "@/lib/connect/token";
import { audit, clientIp } from "@/lib/audit";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api:connect");

/**
 * Begin a remote-login session: the worker will open a real browser at the
 * project's URL and stream it to the caller, who signs in themselves. The raw
 * connect token is returned exactly once here and never stored.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await requireProject(id);
  if (!guard.ok) return guard.response;
  const { auth, project } = guard.value;

  if (!flags.hasWorkerService) {
    return NextResponse.json(
      {
        error:
          "Remote login is not configured. Set WORKER_PUBLIC_URL and WORKER_SERVICE_TOKEN, and deploy the worker as a web service.",
      },
      { status: 503 },
    );
  }

  try {
    const { token, tokenHash } = generateConnectToken();
    const expiresAt = new Date(
      Date.now() + env.connectSessionTtlMinutes * 60 * 1000,
    );

    const session = await db.createConnectSession({
      orgId: auth.org.id,
      projectId: project.id,
      userId: auth.user.id,
      tokenHash,
      startUrl: project.url,
      expiresAt,
    });

    await audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      actorEmail: auth.user.email,
      action: "connect.started",
      targetType: "project",
      targetId: project.id,
      ip: clientIp(req),
    });

    const base = env.workerPublicUrl!.replace(/^http/, "ws").replace(/\/+$/, "");
    log.info(`Started connect session ${session.id} for project ${project.id}`);

    return NextResponse.json(
      {
        sessionId: session.id,
        // Token travels to the browser once, over TLS, and is not persisted.
        websocketUrl: `${base}/connect?token=${encodeURIComponent(token)}`,
        expiresAt: expiresAt.toISOString(),
        startUrl: project.url,
      },
      { status: 201 },
    );
  } catch (err) {
    log.error("Failed to start connect session", err);
    return NextResponse.json(
      { error: "Could not start the remote login session" },
      { status: 500 },
    );
  }
}

/** Poll a connect session's status (the UI uses this to confirm capture). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await requireProject(id);
  if (!guard.ok) return guard.response;

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const session = await db.getConnectSession(sessionId);
  if (!session || session.projectId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: session.status,
    error: session.error,
    expiresAt: new Date(session.expiresAt).toISOString(),
  });
}
