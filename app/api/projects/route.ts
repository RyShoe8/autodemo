import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sealForOrg } from "@/lib/crypto/tenant-keys";
import { createProjectSchema } from "@/lib/validation/schemas";
import { toProjectDTO } from "@/lib/serialize";
import { requireAuth } from "@/lib/auth/guard";
import { audit, clientIp } from "@/lib/audit";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api:projects");

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const projects = await db.listProjects(auth.value.org.id);
    return NextResponse.json({ projects: projects.map(toProjectDTO) });
  } catch (err) {
    log.error("Failed to list projects", err);
    return NextResponse.json(
      { error: "Failed to load projects" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { org, user } = auth.value;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  try {
    const data = parsed.data;
    const project = await db.createProject({
      orgId: org.id,
      name: data.name,
      url: data.url,
      loginEmail: data.loginEmail,
      encryptedPassword: data.loginPassword
        ? await sealForOrg(org.id, data.loginPassword)
        : "",
      brandColor: data.brandColor,
      bumperEnabled: data.bumperEnabled,
      bumperDurationSeconds: data.bumperDurationSeconds,
      bumperTitle: data.bumperTitle ?? data.name,
      bumperTagline: data.bumperTagline,
    });

    await audit({
      orgId: org.id,
      userId: user.id,
      actorEmail: user.email,
      action: "project.created",
      targetType: "project",
      targetId: project.id,
      metadata: { name: project.name },
      ip: clientIp(req),
    });

    return NextResponse.json({ project: toProjectDTO(project) }, { status: 201 });
  } catch (err) {
    log.error("Failed to create project", err);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 },
    );
  }
}
