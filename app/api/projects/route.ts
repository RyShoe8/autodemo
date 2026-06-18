import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { createProjectSchema } from "@/lib/validation/schemas";
import { toProjectDTO } from "@/lib/serialize";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api:projects");

export async function GET() {
  try {
    const projects = await db.listProjects();
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
      name: data.name,
      url: data.url,
      loginEmail: data.loginEmail,
      encryptedPassword: data.loginPassword ? encrypt(data.loginPassword) : "",
      prompt: data.prompt,
      voiceOption: data.voiceOption,
      platforms: data.platforms,
      brandColor: data.brandColor,
      bumperEnabled: data.bumperEnabled,
      bumperDurationSeconds: data.bumperDurationSeconds,
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
