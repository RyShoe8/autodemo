import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { toProjectDTO } from "@/lib/serialize";
import { updateProjectSchema } from "@/lib/validation/schemas";
import { createLogger } from "@/lib/logger";
import type { JobStatus } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api:projects:id");

const ACTIVE_JOB_STATUSES: JobStatus[] = [
  "queued",
  "discovering",
  "building_workflow",
  "recording",
  "generating_script",
  "generating_audio",
  "rendering",
  "exporting",
];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const project = await db.getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ project: toProjectDTO(project) });
  } catch (err) {
    log.error("Failed to load project", err);
    return NextResponse.json({ error: "Failed to load project" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  try {
    const existing = await db.getProject(id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const latestJob = await db.getLatestJobByProject(id);
    if (latestJob && ACTIVE_JOB_STATUSES.includes(latestJob.status)) {
      return NextResponse.json(
        { error: "Cannot edit project while a job is in progress" },
        { status: 409 },
      );
    }

    const data = parsed.data;
    const patch: Parameters<typeof db.updateProject>[1] = {};

    if (data.name !== undefined) patch.name = data.name;
    if (data.url !== undefined) patch.url = data.url;
    if (data.loginEmail !== undefined) patch.loginEmail = data.loginEmail;
    if (data.brandColor !== undefined) patch.brandColor = data.brandColor;
    if (data.bumperEnabled !== undefined) patch.bumperEnabled = data.bumperEnabled;
    if (data.bumperDurationSeconds !== undefined) {
      patch.bumperDurationSeconds = data.bumperDurationSeconds;
    }
    if (data.bumperTitle !== undefined) patch.bumperTitle = data.bumperTitle;
    if (data.bumperTagline !== undefined) patch.bumperTagline = data.bumperTagline;

    if (data.loginPassword && data.loginPassword.length > 0) {
      patch.encryptedPassword = encrypt(data.loginPassword);
    }

    const credentialsChanged =
      (data.url !== undefined && data.url !== existing.url) ||
      (data.loginEmail !== undefined && data.loginEmail !== existing.loginEmail) ||
      (data.loginPassword !== undefined && data.loginPassword.length > 0);

    if (credentialsChanged) {
      patch.applicationMap = {
        pages: [],
        navigation: [],
        navLinks: [],
        screenshots: [],
        uiText: [],
      };
      if (
        existing.status === "ready" ||
        existing.status === "failed"
      ) {
        patch.status = "draft";
      }
    }

    const project = await db.updateProject(id, patch);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ project: toProjectDTO(project) });
  } catch (err) {
    log.error("Failed to update project", err);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const ok = await db.deleteProject(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("Failed to delete project", err);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 },
    );
  }
}
