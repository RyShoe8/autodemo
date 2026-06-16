import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { generateSchema } from "@/lib/validation/schemas";
import { toJobDTO } from "@/lib/serialize";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api:generate");

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { projectId, type } = parsed.data;

  try {
    const project = await db.getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (type === "produce" && (project.workflow ?? []).length === 0) {
      return NextResponse.json(
        { error: "Approve a workflow before recording" },
        { status: 400 },
      );
    }

    // Prevent duplicate concurrent runs.
    const latest = await db.getLatestJobByProject(projectId);
    if (
      latest &&
      latest.status !== "completed" &&
      latest.status !== "failed" &&
      latest.status !== "awaiting_approval"
    ) {
      return NextResponse.json(
        { error: "A job is already in progress for this project" },
        { status: 409 },
      );
    }

    await db.updateProject(projectId, {
      status: type === "discover" ? "discovering" : "recording",
    });

    const job = await db.createJob({ projectId, type });
    log.info(`Enqueued ${type} job ${job.id} for project ${projectId}`);

    return NextResponse.json({ job: toJobDTO(job) }, { status: 201 });
  } catch (err) {
    log.error("Failed to enqueue job", err);
    return NextResponse.json(
      { error: "Failed to start generation" },
      { status: 500 },
    );
  }
}
